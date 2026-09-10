import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import Wave from "wave-engine/helpers/Wave";
import { DuplicateFileOption } from "wave-engine/models/DuplicateFileOptionEnum";
import { HIRES_FILE, PROXY_FILE, downloadAssetFile, targetPath } from "../../lib/helpers/asset-download";

// Nothing here reaches a real Vulcano: port 1 refuses instantly.
const UNREACHABLE = "http://127.0.0.1:1";

// wave-engine's own createFile: an option it does not know keeps the existing file
// untouched, and every other branch ends by writing an empty placeholder.
async function engineCreateFile(filePath: string, option: DuplicateFileOption): Promise<string> {
    if (existsSync(filePath)) {
        switch (option) {
            case DuplicateFileOption.OVERWRITE:
                break;
            case DuplicateFileOption.RENAME_EXISTING:
                await rename(filePath, `${filePath}.1`);
                break;
            case DuplicateFileOption.INCREMENT_NAME:
                filePath = `${filePath}.1`;
                break;
            case DuplicateFileOption.FAIL:
                throw new Error(`Unexpected error when creating file: File ${filePath} already exists`);
            default:
                return filePath;
        }
    }
    await writeFile(filePath, "");
    return filePath;
}

function fakeWave(): Wave {
    return {
        general: { isCanceled: () => false },
        logger: { updateProgressAndMessage: () => undefined },
        fileAndFolderHelper: { createFile: engineCreateFile },
    } as unknown as Wave;
}

let folder: string;
beforeEach(async () => {
    folder = await mkdtemp(path.join(tmpdir(), "vulcano-download-"));
});
afterEach(async () => {
    await rm(folder, { recursive: true, force: true });
});

function request(overrides: Partial<Parameters<typeof downloadAssetFile>[1]> = {}) {
    return {
        baseUrl: UNREACHABLE,
        apiToken: "vt_1",
        ...HIRES_FILE,
        assetId: "asset-1",
        targetFolder: folder,
        fileName: "clip.mov",
        ...overrides,
    };
}

describe("targetPath", () => {
    it("keeps the download inside the target folder", () => {
        expect(targetPath("Could not download", "/media/in", "clip.mov")).toBe(path.join("/media/in", "clip.mov"));
        expect(targetPath("Could not download", "/media/in", "../../etc/cron.d/x")).toBe(path.join("/media/in", "x"));
        expect(targetPath("Could not download", "/media/in", "/etc/passwd")).toBe(path.join("/media/in", "passwd"));
    });

    it("throws a three-part error when nothing usable is left of the name", () => {
        expect(() => targetPath("Could not download", "/media/in", "..")).toThrow(/is not a usable file name/);
        expect(() => targetPath("Could not download", "/media/in", "")).toThrow(/is not a usable file name/);
    });
});

describe("downloadAssetFile", () => {
    it("returns the existing file without downloading when the option is Skip", async () => {
        await writeFile(path.join(folder, "clip.mov"), "kept");

        const result = await downloadAssetFile(fakeWave(), request({ duplicateFileOption: DuplicateFileOption.SKIP }));

        expect(result).toEqual({ filePath: path.join(folder, "clip.mov"), fileSize: 4 });
        expect(await readFile(path.join(folder, "clip.mov"), "utf8")).toBe("kept");
    });

    it("leaves a file that was already there untouched when the download fails", async () => {
        const target = path.join(folder, "clip.mov");
        await writeFile(target, "the take we still need");

        await expect(
            downloadAssetFile(fakeWave(), request({ ...PROXY_FILE, duplicateFileOption: DuplicateFileOption.OVERWRITE }))
        ).rejects.toThrow(/Could not download proxy file — request failed/);

        expect(await readFile(target, "utf8")).toBe("the take we still need");
        expect(await readdir(folder)).toEqual(["clip.mov"]);
    });

    it("refuses to fail over a file that already exists", async () => {
        const target = path.join(folder, "clip.mov");
        await writeFile(target, "kept");

        await expect(downloadAssetFile(fakeWave(), request({ duplicateFileOption: DuplicateFileOption.FAIL }))).rejects.toThrow(
            /already exists/
        );
        expect(await readFile(target, "utf8")).toBe("kept");
    });

    it("stops polling for a cancel when the request is never sent", async () => {
        let polls = 0;
        const wave = {
            general: {
                isCanceled: () => {
                    polls += 1;
                    return false;
                },
            },
            logger: { updateProgressAndMessage: () => undefined },
            fileAndFolderHelper: { createFile: engineCreateFile },
        } as unknown as Wave;

        await expect(downloadAssetFile(wave, request({ baseUrl: "vulcano.example.com" }))).rejects.toThrow(/is not a full address/);

        const polledSoFar = polls;
        await new Promise((resolve) => setTimeout(resolve, 1_200));
        expect(polls).toBe(polledSoFar);
    });

    // An untouched Duplicate file option arrives as "", which createFile does not recognise
    // and would silently let the download replace the file with.
    it("treats an option the engine never filled in as Fail", async () => {
        const target = path.join(folder, "clip.mov");
        await writeFile(target, "the take we still need");

        await expect(downloadAssetFile(fakeWave(), request({ duplicateFileOption: "" as DuplicateFileOption }))).rejects.toThrow(
            /already exists/
        );
        expect(await readFile(target, "utf8")).toBe("the take we still need");
    });
});

describe("two downloads into the same file name", () => {
    let server: http.Server;
    let baseUrl: string;

    beforeEach(async () => {
        server = http.createServer((req, res) => {
            const fill = new URL(req.url ?? "", "http://x").searchParams.get("id") === "a" ? "A" : "B";
            res.writeHead(200, { "content-length": "40000" });
            // Written in slices so both responses interleave, with the second asset answering late.
            let sent = 0;
            const send = () => {
                const tick = setInterval(() => {
                    res.write(fill.repeat(4000));
                    if ((sent += 4000) < 40000) return;
                    clearInterval(tick);
                    res.end();
                }, 1);
            };
            setTimeout(send, fill === "A" ? 0 : 60);
        });
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
        baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });
    afterEach(() => new Promise<void>((resolve) => server.close(() => resolve())));

    it("never mixes the two bodies into one file", async () => {
        const results = await Promise.allSettled([
            downloadAssetFile(fakeWave(), request({ baseUrl, assetId: "a", duplicateFileOption: DuplicateFileOption.OVERWRITE })),
            downloadAssetFile(fakeWave(), request({ baseUrl, assetId: "b", duplicateFileOption: DuplicateFileOption.OVERWRITE })),
        ]);

        expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
        const written = await readFile(path.join(folder, "clip.mov"), "utf8");
        expect(written).toHaveLength(40000);
        expect(new Set(written)).toHaveProperty("size", 1);
    });

    it("gives each download the file it reports, instead of one they both claim", async () => {
        const results = await Promise.all([
            downloadAssetFile(fakeWave(), request({ baseUrl, assetId: "a", duplicateFileOption: DuplicateFileOption.INCREMENT_NAME })),
            downloadAssetFile(fakeWave(), request({ baseUrl, assetId: "b", duplicateFileOption: DuplicateFileOption.INCREMENT_NAME })),
        ]);

        expect(new Set(results.map((result) => result.filePath)).size).toBe(2);
        expect(await readFile(results[0].filePath, "utf8")).toBe("A".repeat(40000));
        expect(await readFile(results[1].filePath, "utf8")).toBe("B".repeat(40000));
    });

    it("keeps the file the first of them saved when the option is Skip", async () => {
        const results = await Promise.all([
            downloadAssetFile(fakeWave(), request({ baseUrl, assetId: "a", duplicateFileOption: DuplicateFileOption.SKIP })),
            downloadAssetFile(fakeWave(), request({ baseUrl, assetId: "b", duplicateFileOption: DuplicateFileOption.SKIP })),
        ]);

        const target = path.join(folder, "clip.mov");
        expect(results.map((result) => result.filePath)).toEqual([target, target]);
        expect(await readFile(target, "utf8")).toBe("A".repeat(40000));
    });
});
