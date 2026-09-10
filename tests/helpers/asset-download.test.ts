import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import Wave from "wave-engine/helpers/Wave";
import { DuplicateFileOption } from "wave-engine/models/DuplicateFileOptionEnum";
import { HIRES_FILE, PROXY_FILE, downloadAssetFile } from "../../lib/helpers/asset-download";

// Nothing here reaches a real Vulcano: port 1 refuses instantly.
const UNREACHABLE = "http://127.0.0.1:1";

function fakeWave(createdPath: string): Wave {
    return {
        general: { isCanceled: () => false },
        logger: { updateProgressAndMessage: () => undefined },
        fileAndFolderHelper: { createFile: async () => createdPath },
    } as unknown as Wave;
}

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
