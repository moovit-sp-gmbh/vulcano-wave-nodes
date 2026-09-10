import { openAsBlob } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { AxiosRequestConfig } from "axios";

export const REDACTED_TOKEN = "Bearer <your-token>";

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
