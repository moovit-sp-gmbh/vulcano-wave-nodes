import { createWriteStream, openAsBlob } from "node:fs";
import { access, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import axios, { AxiosRequestConfig } from "axios";
import { DuplicateFileOption } from "wave-engine/models/DuplicateFileOptionEnum";
import Wave from "wave-engine/helpers/Wave";

export const REDACTED_TOKEN = "Bearer <your-token>";

/** The endpoint each download node streams from, paired with the error it reports. */
export const HIRES_FILE = { endpoint: "/hires", action: "Could not download highres file" } as const;
export const PROXY_FILE = { endpoint: "/proxy", action: "Could not download proxy file" } as const;

const REQUEST_TIMEOUT_MS = 60_000;

/** Drops the trailing slashes a pasted url usually carries. */
export function normalizeBaseUrl(baseUrl: string): string {
    return baseUrl.replace(/\/+$/, "");
}

/** Builds an authenticated request against a Vulcano instance. */
export function vulcanoRequest(baseUrl: string, apiToken: string, config: AxiosRequestConfig): AxiosRequestConfig {
    return {
        timeout: REQUEST_TIMEOUT_MS,
        ...config,
        url: `${normalizeBaseUrl(baseUrl)}${config.url ?? ""}`,
        headers: { Authorization: `Bearer ${apiToken}`, ...config.headers },
    };
}

/** Same request with the token swapped for a placeholder, for the Curl output. */
export function redactToken(config: AxiosRequestConfig): AxiosRequestConfig {
    return { ...config, headers: { ...config.headers, Authorization: REDACTED_TOKEN } };
}

// Both error shapes the catalog sees: "Axios Error: ... (404)" from the wave helper,
// "Request failed with status code 404" from a raw axios call.
function hasStatus(message: string, status: string): boolean {
    return message.includes(`(${status})`) || message.includes(`status code ${status}`);
}

/** Translates an axios failure into a three-part node error, per status where `byStatus` names one. */
export function vulcanoError(action: string, err: unknown, hint: string, byStatus: Record<string, string> = {}): Error {
    const message = (err as Error)?.message ?? "unknown error";
    for (const [status, reason] of Object.entries(byStatus)) {
        if (hasStatus(message, status)) return new Error(`${action} — ${reason}`);
    }
    if (hasStatus(message, "401") || hasStatus(message, "403")) {
        return new Error("Could not authenticate — Vulcano rejected the Api token — verify the token is valid and has not expired");
    }
    return new Error(`${action} — request failed: ${message} — ${hint}`);
}

/** Size of a local file the agent must be able to read, or a three-part node error. */
export async function localFileSize(action: string, inputName: string, filePath: string): Promise<number> {
    try {
        return (await stat(filePath)).size;
    } catch {
        throw new Error(`${action} — no file at ${filePath} — verify the ${inputName} is reachable from the agent`);
    }
}

/** Streams a local file into a multipart body without reading it into memory. */
export async function fileUploadForm(fieldName: string, filePath: string): Promise<FormData> {
    const form = new FormData();
    form.append(fieldName, await openAsBlob(filePath), path.basename(filePath));
    return form;
}

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
