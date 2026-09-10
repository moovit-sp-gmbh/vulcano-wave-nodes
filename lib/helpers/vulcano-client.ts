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

/** Drops the trailing slashes a pasted url usually carries, and rejects one that is not a url at all. */
export function normalizeBaseUrl(baseUrl: string): string {
    const trimmed = (baseUrl ?? "").trim().replace(/\/+$/, "");
    let parsed: URL;
    try {
        parsed = new URL(trimmed);
    } catch {
        throw new Error(`Vulcano url is not usable — "${baseUrl}" is not a full address — enter it as https://vulcano.example.com`);
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        throw new Error(`Vulcano url is not usable — "${baseUrl}" is not an http address — enter it as https://vulcano.example.com`);
    }
    return trimmed;
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

/** The status of a raw axios failure; the wave helper rethrows a plain Error, so this is often absent. */
function statusOf(err: unknown): number | undefined {
    const status = (err as { response?: { status?: unknown } })?.response?.status;
    return typeof status === "number" ? status : undefined;
}

// Fallback for the wave helper's "Axios Error: ... (404)" and a raw axios "status code 404",
// used only when the error carries no response of its own.
function mentionsStatus(message: string, status: string): boolean {
    return message.includes(`(${status})`) || message.includes(`status code ${status}`);
}

/** A refused or unreachable host arrives as an AggregateError whose message is empty. */
export function describeError(err: unknown): string {
    const failure = err as { message?: string; code?: string; cause?: { errors?: { code?: string }[] } };
    const message = failure?.message?.trim();
    if (message) return message;
    return failure?.code ?? failure?.cause?.errors?.[0]?.code ?? "unknown error";
}

/** Translates an axios failure into a three-part node error, per status where `byStatus` names one. */
export function vulcanoError(action: string, err: unknown, hint: string, byStatus: Record<string, string> = {}): Error {
    const message = describeError(err);
    const status = statusOf(err);
    const matches = (candidate: string): boolean =>
        status !== undefined ? String(status) === candidate : mentionsStatus(message, candidate);

    for (const [candidate, reason] of Object.entries(byStatus)) {
        if (matches(candidate)) return new Error(`${action} — ${reason}`, { cause: err });
    }
    if (matches("401") || matches("403")) {
        return new Error("Could not authenticate — Vulcano rejected the Api token — verify the token is valid and has not expired", {
            cause: err,
        });
    }
    return new Error(`${action} — request failed: ${message} — ${hint}`, { cause: err });
}

/** Size of a local file the agent must be able to read, or a three-part node error. */
export async function localFileSize(action: string, inputName: string, filePath: string): Promise<number> {
    let stats;
    try {
        stats = await stat(filePath);
    } catch (err: unknown) {
        const unreadable = (err as NodeJS.ErrnoException)?.code === "EACCES";
        const reason = unreadable ? `${filePath} cannot be read` : `no file at ${filePath}`;
        throw new Error(`${action} — ${reason} — verify the ${inputName} is reachable from the agent`);
    }
    if (stats.isDirectory()) {
        throw new Error(`${action} — ${filePath} is a folder — set the ${inputName} to a file`);
    }
    return stats.size;
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
