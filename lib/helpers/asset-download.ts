import { randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { access, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import axios, { AxiosRequestConfig } from "axios";
import { DuplicateFileOption } from "wave-engine/models/DuplicateFileOptionEnum";
import Wave from "wave-engine/helpers/Wave";
import { isCanceled, safely, withCancel } from "./cancellation";
import { describeError, vulcanoError, vulcanoRequest } from "./vulcano-client";

/** The endpoint each download node streams from, paired with the error it reports. */
export const HIRES_FILE = { endpoint: "/hires", action: "Could not download highres file" } as const;
export const PROXY_FILE = { endpoint: "/proxy", action: "Could not download proxy file" } as const;

export interface DownloadedFile {
    filePath: string;
    fileSize: number;
}

export interface AssetFileDownload {
    baseUrl: string;
    apiToken: string;
    endpoint: string;
    action: string;
    assetId: string;
    targetFolder: string;
    fileName: string;
    duplicateFileOption?: DuplicateFileOption;
}

type ResolvedDownload = AssetFileDownload & { duplicateFileOption: DuplicateFileOption };

const OPTIONS: string[] = Object.values(DuplicateFileOption);

// The engine substitutes no defaultValue and does not check a select against its own options,
// so a wired value can be anything; createFile keeps the existing file for one it does not know.
function knownOption(value: DuplicateFileOption | undefined): DuplicateFileOption {
    return OPTIONS.includes(value as string) ? (value as DuplicateFileOption) : DuplicateFileOption.FAIL;
}

/** Keeps the download inside Target folder: a name carrying `..` or a path would otherwise escape it. */
export function targetPath(action: string, targetFolder: string, fileName: string): string {
    const name = path.basename(fileName ?? "");
    if (name === "" || name === "." || name === "..") {
        throw new Error(`${action} — "${fileName}" is not a usable file name — set File name to a plain name such as clip.mov`);
    }
    return path.join(targetFolder, name);
}

async function fileExists(filePath: string): Promise<boolean> {
    return access(filePath).then(
        () => true,
        () => false
    );
}

// Skip and Fail are the only options that answer for a file already there; createFile cannot
// report either one back, and Fail should not cost a transfer first.
async function existingTarget(options: ResolvedDownload, requestedPath: string): Promise<DownloadedFile | undefined> {
    const option = options.duplicateFileOption;
    if (option !== DuplicateFileOption.SKIP && option !== DuplicateFileOption.FAIL) return undefined;
    if (!(await fileExists(requestedPath))) return undefined;
    if (option === DuplicateFileOption.FAIL) {
        throw new Error(
            `${options.action} — ${requestedPath} already exists — choose another File name or a different Duplicate file option`
        );
    }
    return { filePath: requestedPath, fileSize: (await stat(requestedPath)).size };
}

/** Pipes the response body onto disk, reporting progress once per whole percent. */
async function streamToFile(
    wave: Wave,
    response: { data: NodeJS.ReadableStream; headers: Record<string, unknown> },
    partPath: string
): Promise<number> {
    const declared = Number(response.headers["content-length"]);
    const totalBytes = Number.isFinite(declared) && declared > 0 ? declared : 0;
    let bytesReceived = 0;
    let lastPercent = -1;

    response.data.on("data", (chunk: Buffer) => {
        bytesReceived += chunk.length;
        if (totalBytes <= 0) return;
        // A body the server compressed decodes to more than content-length announced.
        const percent = Math.min(100, Math.floor((bytesReceived / totalBytes) * 100));
        if (percent === lastPercent) return;
        lastPercent = percent;
        safely(() => wave.logger.updateProgressAndMessage(percent, `Downloaded ${bytesReceived} of ${totalBytes} bytes`));
    });
    await pipeline(response.data, createWriteStream(partPath));
    return bytesReceived;
}

/** Streams the asset into the part file; the request is built under the poller, because building it can throw. */
async function downloadToPartFile(wave: Wave, options: ResolvedDownload, partPath: string): Promise<number> {
    return withCancel(wave, async (signal) => {
        const requestConfig = vulcanoRequest(options.baseUrl, options.apiToken, {
            method: "GET",
            url: options.endpoint,
            params: { id: options.assetId },
            responseType: "stream",
            signal,
        });
        return runDownload(wave, options, requestConfig, partPath);
    });
}

/** Streams the response into the part file, reporting a failure in the node's own words. */
async function runDownload(wave: Wave, options: ResolvedDownload, requestConfig: AxiosRequestConfig, partPath: string): Promise<number> {
    try {
        return await streamToFile(wave, await axios(requestConfig), partPath);
    } catch (err: unknown) {
        await unlink(partPath).catch(() => undefined);
        // axios never drains the error body when responseType is "stream", leaking the socket.
        (err as { response?: { data?: { destroy?: () => void } } })?.response?.data?.destroy?.();
        if (isCanceled(wave)) {
            throw new Error("Download canceled — the stream was stopped — no action needed");
        }
        throw vulcanoError(options.action, err, "verify the Vulcano url, Api token and Asset id", {
            404: "Vulcano has no such file for this asset (404) — verify the Asset id and that the file has finished rendering",
        });
    }
}

const finishing = new Map<string, Promise<unknown>>();

/** createFile picks a free name and rename claims it, so two downloads must not interleave between them. */
async function oneAtATime<T>(key: string, run: () => Promise<T>): Promise<T> {
    const mine = (finishing.get(key) ?? Promise.resolve()).then(run, run);
    const settled = mine.catch(() => undefined);
    finishing.set(key, settled);
    try {
        return await mine;
    } finally {
        if (finishing.get(key) === settled) finishing.delete(key);
    }
}

/** Claims the name the engine picks for the duplicate-file option and moves the download onto it. */
async function movePartIntoPlace(
    wave: Wave,
    options: ResolvedDownload,
    requestedPath: string,
    partPath: string,
    fileSize: number
): Promise<DownloadedFile> {
    return oneAtATime(requestedPath, async () => {
        // Skip and Fail can only be honoured against the file that is there once the name is held.
        const existing = await existingTarget(options, requestedPath);
        if (existing) return existing;

        let finalPath: string | undefined;
        try {
            finalPath = await wave.fileAndFolderHelper.createFile(requestedPath, options.duplicateFileOption);
            await rename(partPath, finalPath);
            return { filePath: finalPath, fileSize };
        } catch (err: unknown) {
            // Every branch createFile can reach from here writes an empty placeholder of its own.
            if (finalPath) await unlink(finalPath).catch(() => undefined);
            const reason = describeError(err).replaceAll(partPath, requestedPath);
            throw new Error(
                `${options.action} — ${requestedPath} could not be created: ${reason} — verify Target folder is writable and check Duplicate file option`
            );
        }
    });
}

/** Streams one asset's file into a target folder, honouring the duplicate-file option. */
export async function downloadAssetFile(wave: Wave, request: AssetFileDownload): Promise<DownloadedFile> {
    const options: ResolvedDownload = { ...request, duplicateFileOption: knownOption(request.duplicateFileOption) };
    const requestedPath = targetPath(options.action, options.targetFolder, options.fileName);

    const existing = await existingTarget(options, requestedPath);
    if (existing) return existing;

    // Downloaded under a name of its own, so a second download into the same folder
    // cannot share the part file, and a failed transfer never touches the target.
    const partPath = `${requestedPath}.${randomBytes(6).toString("hex")}.part`;
    const fileSize = await downloadToPartFile(wave, options, partPath);
    try {
        return await movePartIntoPlace(wave, options, requestedPath, partPath, fileSize);
    } finally {
        await unlink(partPath).catch(() => undefined);
    }
}
