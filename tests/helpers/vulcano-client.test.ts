import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Wave from "wave-engine/helpers/Wave";
import { DuplicateFileOption } from "wave-engine/models/DuplicateFileOptionEnum";
import {
    HIRES_FILE,
    PROXY_FILE,
    REDACTED_TOKEN,
    downloadAssetFile,
    fileUploadForm,
    localFileSize,
    normalizeBaseUrl,
    redactToken,
    vulcanoError,
    vulcanoRequest,
} from "../../lib/helpers/vulcano-client";

// Nothing here reaches a real Vulcano: port 1 refuses instantly.
const UNREACHABLE = "http://127.0.0.1:1";

function fakeWave(createdPath: string): Wave {
    return {
        general: { isCanceled: () => false },
        logger: { updateProgressAndMessage: () => undefined },
        fileAndFolderHelper: { createFile: async () => createdPath },
    } as unknown as Wave;
}

describe("normalizeBaseUrl", () => {
    it("drops trailing slashes and leaves a clean url alone", () => {
        expect(normalizeBaseUrl("https://vulcano.example.com//")).toBe("https://vulcano.example.com");
        expect(normalizeBaseUrl("https://vulcano.example.com")).toBe("https://vulcano.example.com");
    });

    it("refuses something that is not a url, rather than building a broken request", () => {
        expect(() => normalizeBaseUrl("vulcano.example.com")).toThrow(/is not a full address/);
        expect(() => normalizeBaseUrl("file:///etc/passwd")).toThrow(/is not an http address/);
    });

    it("accepts the plain http url an on-premise instance is usually reached by", () => {
        expect(normalizeBaseUrl("http://vulcano.local:8080/")).toBe("http://vulcano.local:8080");
    });
});

describe("vulcanoRequest", () => {
    it("joins the base url and the path, tolerating trailing slashes", () => {
        expect(vulcanoRequest("https://vulcano.example.com//", "vt_1", { url: "/assets" }).url).toBe("https://vulcano.example.com/assets");
    });

    it("sends the token as a bearer header", () => {
        expect(vulcanoRequest("https://vulcano.example.com", "vt_1", { url: "/assets" }).headers).toEqual({
            Authorization: "Bearer vt_1",
        });
    });
});

describe("redactToken", () => {
    it("replaces the token but keeps the rest of the request", () => {
        const config = vulcanoRequest("https://vulcano.example.com", "vt_1", { url: "/assets", method: "POST" });
        const redacted = redactToken(config);
        expect(redacted.headers?.Authorization).toBe(REDACTED_TOKEN);
        expect(redacted.url).toBe(config.url);
    });
});

describe("vulcanoError", () => {
    it("uses the message mapped to the status", () => {
        const error = vulcanoError("Could not create graphic", new Error("Axios Error: nope (404)"), "hint", {
            404: "no such asset (404) — verify the id",
        });
        expect(error.message).toBe("Could not create graphic — no such asset (404) — verify the id");
    });

    it("prefers a mapped status over the shared authentication message", () => {
        const error = vulcanoError("Could not add assets", new Error("status code 403"), "hint", {
            403: "the project is locked (403) — unlock it first",
        });
        expect(error.message).toBe("Could not add assets — the project is locked (403) — unlock it first");
    });

    it("falls back to a shared message for a rejected token", () => {
        expect(vulcanoError("Could not list templates", new Error("Axios Error: nope (401)"), "hint").message).toMatch(
            /Could not authenticate/
        );
    });

    it("does not read a status out of the server's own message text", () => {
        const error = vulcanoError("Could not create graphic", new Error("Axios Error: /News/404 Update.mogrt (500)"), "verify the id", {
            404: "no such asset (404) — verify the id",
        });
        expect(error.message).toMatch(/request failed/);
    });

    it("keeps the underlying message for anything else", () => {
        expect(vulcanoError("Could not list templates", new Error("ECONNREFUSED"), "verify the url").message).toBe(
            "Could not list templates — request failed: ECONNREFUSED — verify the url"
        );
    });
});

describe("localFileSize", () => {
    it("returns the size of a readable file", async () => {
        const folder = await mkdtemp(path.join(tmpdir(), "vulcano-size-"));
        const file = path.join(folder, "clip.mogrt");
        await writeFile(file, "12345");
        await expect(localFileSize("Could not upload mogrt", "Mogrt file path", file)).resolves.toBe(5);
    });

    it("throws a three-part error naming the input when the file is missing", async () => {
        await expect(localFileSize("Could not upload mogrt", "Mogrt file path", "/nope/missing.mogrt")).rejects.toThrow(
            /Could not upload mogrt — no file at \/nope\/missing\.mogrt — verify the Mogrt file path/
        );
    });
});

describe("fileUploadForm", () => {
    it("puts the file under the field name the endpoint expects, keeping its name", async () => {
        const folder = await mkdtemp(path.join(tmpdir(), "vulcano-form-"));
        const file = path.join(folder, "Lower third.mogrt");
        await writeFile(file, "MOGRT");

        const form = await fileUploadForm("filename", file);
        const part = form.get("filename") as File;
        expect(part).toBeInstanceOf(Blob);
        expect(part.name).toBe("Lower third.mogrt");
        expect(await part.text()).toBe("MOGRT");
    });
});

describe("downloadAssetFile", () => {
    it("pairs each endpoint with its own error message", () => {
        expect(HIRES_FILE).toEqual({ endpoint: "/hires", action: "Could not download highres file" });
        expect(PROXY_FILE).toEqual({ endpoint: "/proxy", action: "Could not download proxy file" });
    });

    it("returns the existing file without downloading when the option is Skip", async () => {
        const folder = await mkdtemp(path.join(tmpdir(), "vulcano-skip-"));
        await writeFile(path.join(folder, "clip.mov"), "kept");

        const result = await downloadAssetFile(fakeWave(path.join(folder, "clip.mov")), {
            baseUrl: UNREACHABLE,
            apiToken: "vt_1",
            ...HIRES_FILE,
            assetId: "asset-1",
            targetFolder: folder,
            fileName: "clip.mov",
            duplicateFileOption: DuplicateFileOption.SKIP,
        });

        expect(result).toEqual({ filePath: path.join(folder, "clip.mov"), fileSize: 4 });
        expect(await readFile(path.join(folder, "clip.mov"), "utf8")).toBe("kept");
    });

    it("removes the file it created when the download fails", async () => {
        const folder = await mkdtemp(path.join(tmpdir(), "vulcano-fail-"));
        const target = path.join(folder, "clip.mov");
        await writeFile(target, "");

        await expect(
            downloadAssetFile(fakeWave(target), {
                baseUrl: UNREACHABLE,
                apiToken: "vt_1",
                ...PROXY_FILE,
                assetId: "asset-1",
                targetFolder: folder,
                fileName: "clip.mov",
                duplicateFileOption: DuplicateFileOption.OVERWRITE,
            })
        ).rejects.toThrow(/Could not download proxy file — request failed/);
        expect(existsSync(target)).toBe(false);
    });
});
