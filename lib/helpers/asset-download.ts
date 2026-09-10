import { createWriteStream } from "node:fs";
import { access, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import axios from "axios";
import { DuplicateFileOption } from "wave-engine/models/DuplicateFileOptionEnum";
import Wave from "wave-engine/helpers/Wave";
import { vulcanoError, vulcanoRequest } from "./vulcano-client";

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
    duplicateFileOption: DuplicateFileOption;
}

/** createFile's SKIP branch cannot tell us the file was already there, so look before writing. */
async function skippableFile(requestedPath: string, option: DuplicateFileOption): Promise<DownloadedFile | undefined> {
    if (option !== DuplicateFileOption.SKIP) return undefined;
    try {
        await access(requestedPath);
        return { filePath: requestedPath, fileSize: (await stat(requestedPath)).size };
    } catch {
        return undefined;
    }
}

/** Pipes the response body onto disk, reporting progress once per whole percent. */
async function streamToFile(
    wave: Wave,
    response: { data: NodeJS.ReadableStream; headers: Record<string, unknown> },
    finalPath: string
): Promise<number> {
    const totalBytes = Number(response.headers["content-length"] ?? 0);
    let bytesReceived = 0;
    let lastPercent = -1;

    response.data.on("data", (chunk: Buffer) => {
        bytesReceived += chunk.length;
        if (totalBytes <= 0) return;
        const percent = Math.floor((bytesReceived / totalBytes) * 100);
        if (percent === lastPercent) return;
        lastPercent = percent;
        wave.logger.updateProgressAndMessage(percent, `Downloaded ${bytesReceived} of ${totalBytes} bytes`);
    });
    await pipeline(response.data, createWriteStream(finalPath));
    return bytesReceived;
}

/** Streams one asset's file into a target folder, honouring the duplicate-file option. */
export async function downloadAssetFile(wave: Wave, options: AssetFileDownload): Promise<DownloadedFile> {
    const requestedPath = path.join(options.targetFolder, options.fileName);
    const skipped = await skippableFile(requestedPath, options.duplicateFileOption);
    if (skipped) return skipped;

    let finalPath: string;
    try {
        finalPath = await wave.fileAndFolderHelper.createFile(requestedPath, options.duplicateFileOption);
    } catch (err: unknown) {
        throw new Error(
            `${options.action} — ${requestedPath} could not be created: ${(err as Error)?.message ?? "unknown error"} — verify Target folder is writable and check Duplicate file option`
        );
    }

    const controller = new AbortController();
    let cancelInterval: NodeJS.Timeout | undefined;
    try {
        const response = await axios(
            vulcanoRequest(options.baseUrl, options.apiToken, {
                method: "GET",
                url: options.endpoint,
                params: { id: options.assetId },
                responseType: "stream",
                signal: controller.signal,
            })
        );
        cancelInterval = setInterval(() => {
            if (wave.general.isCanceled()) controller.abort();
        }, 1_000);
        return { filePath: finalPath, fileSize: await streamToFile(wave, response, finalPath) };
    } catch (err: unknown) {
        await unlink(finalPath).catch(() => undefined);
        if (wave.general.isCanceled()) {
            throw new Error("Download canceled — the stream was stopped — no action needed");
        }
        throw vulcanoError(options.action, err, "verify the Vulcano url, Api token and Asset id", {
            404: "Vulcano has no such file for this asset (404) — verify the Asset id and that the file has finished rendering",
        });
    } finally {
        if (cancelInterval) clearInterval(cancelInterval);
    }
}
