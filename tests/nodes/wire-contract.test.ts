import { existsSync } from "node:fs";
import http from "node:http";
import { AddressInfo } from "node:net";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import Wave, { AxiosHelper } from "wave-engine/helpers/Wave";
import { DuplicateFileOption } from "wave-engine/models/DuplicateFileOptionEnum";
import Node from "../../lib/Node";
import AddAssetsToProject from "../../lib/nodes/AddAssetsToProject";
import CreateGraphic from "../../lib/nodes/CreateGraphic";
import CreateOgrafLink from "../../lib/nodes/CreateOgrafLink";
import CreateVggProject from "../../lib/nodes/CreateVggProject";
import DownloadHighresFile from "../../lib/nodes/DownloadHighresFile";
import DownloadProxyFile from "../../lib/nodes/DownloadProxyFile";
import ListTemplates from "../../lib/nodes/ListTemplates";
import UploadMogrt from "../../lib/nodes/UploadMogrt";

interface SeenRequest {
    method: string;
    pathname: string;
    query: Record<string, string>;
    authorization?: string;
    body: string;
}

type Reply = { status?: number; headers?: Record<string, string>; body: string };

let server: http.Server;
let baseUrl: string;
let seen: SeenRequest[];
let routes: Record<string, Reply>;
let folder: string;

beforeAll(async () => {
    server = http.createServer((req, res) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => {
            seen.push({
                method: req.method ?? "",
                pathname: url.pathname,
                query: Object.fromEntries(url.searchParams),
                authorization: req.headers.authorization,
                body: Buffer.concat(chunks).toString("utf8"),
            });
            // An exact path wins; a key ending in "/" also matches everything below it.
            const prefix = Object.keys(routes).find((route) => route.endsWith("/") && url.pathname.startsWith(route));
            const reply = routes[url.pathname] ?? (prefix ? routes[prefix] : undefined) ?? { status: 404, body: "no route" };
            res.writeHead(reply.status ?? 200, { "content-type": "application/json", ...reply.headers });
            res.end(reply.body);
        });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(async () => {
    seen = [];
    routes = {};
    folder = await mkdtemp(path.join(tmpdir(), "vulcano-wire-"));
});

afterEach(async () => {
    await rm(folder, { recursive: true, force: true });
});

// wave-engine's own createFile: an option it does not know keeps the existing file
// untouched, and every other branch ends by writing an empty placeholder.
async function engineCreateFile(filePath: string, option: DuplicateFileOption): Promise<string> {
    if (existsSync(filePath)) {
        if (option === DuplicateFileOption.FAIL) {
            throw new Error(`Unexpected error when creating file: File ${filePath} already exists`);
        }
        if (option !== DuplicateFileOption.OVERWRITE) return filePath;
    }
    await writeFile(filePath, "");
    return filePath;
}

function fakeWave(inputs: Record<string, unknown>, outputs: Record<string, unknown>): Wave {
    return {
        inputs: { getInputValueByInputName: (name: string) => inputs[name] },
        outputs: {
            setOutput: (name: string, value: unknown) => {
                outputs[name] = value;
            },
        },
        axiosHelper: new AxiosHelper(),
        logger: { updateProgressAndMessage: () => undefined },
        general: { isCanceled: () => false },
        fileAndFolderHelper: { createFile: engineCreateFile },
    } as unknown as Wave;
}

async function run(node: Node, inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const outputs: Record<string, unknown> = {};
    node.wave = fakeWave({ "Vulcano url": baseUrl, "Api token": "vt_1", ...inputs }, outputs);
    await node.execute();
    return outputs;
}

async function mogrtFile(name = "Lower third.mogrt"): Promise<string> {
    const file = path.join(folder, name);
    await writeFile(file, "MOGRT-BYTES");
    return file;
}

describe("every node's request reaches Vulcano the way the API expects", () => {
    it("Create graphic posts the reduced asset", async () => {
        routes["/assets"] = {
            body: JSON.stringify({ id: "new-1", name: "Lower third", status: "NEW", properties: [{ id: "headline", value: "Hi" }] }),
        };

        const outputs = await run(new CreateGraphic(), {
            "Template asset id": "tpl-1",
            "Graphic property values": { headline: "Hi" },
            "Vulcano user": "editor",
            "Output file name": "clip.mov",
        });

        expect(seen).toHaveLength(1);
        expect(seen[0].method).toBe("POST");
        expect(seen[0].pathname).toBe("/assets");
        expect(seen[0].query).toEqual({ user: "editor", reduced: "true", filename: "clip.mov" });
        expect(seen[0].authorization).toBe("Bearer vt_1");
        expect(JSON.parse(seen[0].body)).toEqual({ id: "tpl-1", properties: [{ id: "headline", value: "Hi" }] });
        expect(outputs["Graphic id"]).toBe("new-1");
    });

    it("Add assets to project posts the id list", async () => {
        routes["/projects"] = { body: "{}" };

        const outputs = await run(new AddAssetsToProject(), { "Project id": "proj-1", "Asset ids": ["a-1", "a-2"] });

        expect(seen[0].method).toBe("POST");
        expect(seen[0].pathname).toBe("/projects");
        expect(seen[0].query).toEqual({ projectID: "proj-1" });
        expect(seen[0].authorization).toBe("Bearer vt_1");
        expect(JSON.parse(seen[0].body)).toEqual(["a-1", "a-2"]);
        expect(outputs["Sent asset count"]).toBe(2);
    });

    it("List templates gets the folder with the documented defaults", async () => {
        routes["/assets"] = { headers: { "x-total-count": "80" }, body: JSON.stringify([{ id: "tpl-1", name: "Lower third" }]) };

        const outputs = await run(new ListTemplates(), {});

        expect(seen[0].method).toBe("GET");
        expect(seen[0].pathname).toBe("/assets");
        // The engine substitutes no defaults, so the node has to send them itself.
        expect(seen[0].query).toEqual({ id: "root/Templates", page: "0", limit: "35", sortBy: "created", sortDirection: "desc" });
        expect(outputs["Total count"]).toBe(80);
        expect(outputs["Template ids"]).toEqual(["tpl-1"]);
    });

    it.each([
        ["Download highres file", () => new DownloadHighresFile(), "/hires"],
        ["Download proxy file", () => new DownloadProxyFile(), "/proxy"],
    ])("%s streams the asset onto disk", async (_name, make, endpoint) => {
        routes[endpoint] = { headers: { "content-type": "application/octet-stream" }, body: "VIDEO-BYTES" };

        const outputs = await run(make(), {
            "Asset id": "asset-1",
            "Target folder": folder,
            "File name": "clip.mov",
            "Duplicate file option": DuplicateFileOption.OVERWRITE,
        });

        expect(seen[0].method).toBe("GET");
        expect(seen[0].pathname).toBe(endpoint);
        expect(seen[0].query).toEqual({ id: "asset-1" });
        expect(seen[0].authorization).toBe("Bearer vt_1");
        expect(outputs["File path"]).toBe(path.join(folder, "clip.mov"));
        expect(outputs["File size"]).toBe(11);
        expect(await readFile(path.join(folder, "clip.mov"), "utf8")).toBe("VIDEO-BYTES");
    });

    it("Upload mogrt posts the file under the filename part", async () => {
        routes["/files"] = { body: "{}" };
        const file = await mogrtFile();

        const outputs = await run(new UploadMogrt(), { "Tree node id": "News", "Mogrt file path": file });

        expect(seen[0].method).toBe("POST");
        expect(seen[0].pathname).toBe("/files");
        expect(seen[0].query).toEqual({ nodeId: "News" });
        expect(seen[0].body).toContain('name="filename"');
        expect(seen[0].body).toContain("MOGRT-BYTES");
        expect(outputs["Uploaded file name"]).toBe("Lower third.mogrt");
    });

    it("Create vgg project uploads the video, then saves the project that points at it", async () => {
        routes["/graphicGenerator/uploadBaseVideo"] = { headers: { "content-type": "text/plain" }, body: "/media/base/clip.mov" };
        routes["/graphicGenerator/jobs/"] = { body: JSON.stringify({ id: "draft_1", name: "Interview", status: "DRAFT" }) };
        const file = path.join(folder, "interview.mov");
        await writeFile(file, "VIDEO");
        const outputs = await run(new CreateVggProject(), { "Video file path": file, "Project name": "Interview" });

        expect(seen[0].method).toBe("POST");
        expect(seen[0].pathname).toBe("/graphicGenerator/uploadBaseVideo");
        expect(seen[0].body).toContain('name="file"');
        expect(seen[1].method).toBe("PUT");
        expect(seen[1].pathname).toMatch(/^\/graphicGenerator\/jobs\/draft_/);
        const savedPath = JSON.parse(seen[1].body).baseVideoPath;
        // The upload answers with a bare path, so a JSON parse would have lost it.
        expect(savedPath).toBe("/media/base/clip.mov");
        expect(JSON.parse(seen[1].body).name).toBe("Interview");
        expect(outputs["Project id"]).toMatch(/^draft_/);
    });

    it("Create ograf link posts the expiry and the control values", async () => {
        routes["/assets/ograf/links"] = { body: JSON.stringify({ id: "link-1", token: "tok-1" }) };

        const outputs = await run(new CreateOgrafLink(), {
            "Asset id": "asset-1",
            "Link control values": '{"headline":"Hi"}',
        });

        expect(seen[0].method).toBe("POST");
        expect(seen[0].pathname).toBe("/assets/ograf/links");
        expect(seen[0].query).toEqual({ assetId: "asset-1" });
        expect(JSON.parse(seen[0].body)).toEqual({ expiryDays: 30, data: { headline: "Hi" } });
        expect(outputs["Player url"]).toBe(`${baseUrl}/ograf-player.html?link=tok-1`);
    });
});

describe("the server answering 200 is not the same as the server doing what was asked", () => {
    it("Create graphic fails when Vulcano drops a property id it does not know", async () => {
        routes["/assets"] = { body: JSON.stringify({ id: "new-1", properties: [{ id: "headline", value: "Hi" }] }) };

        await expect(
            run(new CreateGraphic(), {
                "Template asset id": "tpl-1",
                "Graphic property values": { headline: "Hi", "typo-id": "Dropped" },
                "Vulcano user": "editor",
            })
        ).rejects.toThrow(/ignored the property ids typo-id/);
    });

    it("Create graphic fails when Vulcano clamps the requested duration", async () => {
        routes["/assets"] = { body: JSON.stringify({ id: "new-1", properties: [], outputDurationSeconds: 110 }) };

        await expect(
            run(new CreateGraphic(), { "Template asset id": "tpl-1", "Vulcano user": "editor", "Output duration seconds": 45 })
        ).rejects.toThrow(/applied 110s instead of the requested 45s/);
    });

    it("List templates refuses a 200 that is not a list", async () => {
        routes["/assets"] = { body: JSON.stringify({ message: "hello" }) };

        await expect(run(new ListTemplates(), {})).rejects.toThrow(/Could not list templates/);
    });

    it("Create ograf link refuses a link with no token", async () => {
        routes["/assets/ograf/links"] = { body: JSON.stringify({ id: "link-1" }) };

        await expect(run(new CreateOgrafLink(), { "Asset id": "asset-1" })).rejects.toThrow(/without a token/);
    });
});

describe("each node reports its own mapped status", () => {
    it("maps the download 404 to the asset hint", async () => {
        routes["/hires"] = { status: 404, body: "not found" };

        await expect(
            run(new DownloadHighresFile(), {
                "Asset id": "asset-1",
                "Target folder": folder,
                "File name": "clip.mov",
                "Duplicate file option": DuplicateFileOption.OVERWRITE,
            })
        ).rejects.toThrow(/Vulcano has no such file for this asset \(404\)/);
    });

    it("maps any 401 to the token hint, whatever the node", async () => {
        routes["/projects"] = { status: 401, body: "nope" };

        await expect(run(new AddAssetsToProject(), { "Project id": "proj-1", "Asset ids": ["a-1"] })).rejects.toThrow(
            /Vulcano rejected the Api token/
        );
    });

    it("maps the vgg 409 to the packaging hint", async () => {
        routes["/graphicGenerator/uploadBaseVideo"] = { headers: { "content-type": "text/plain" }, body: "/media/base/clip.mov" };
        const file = path.join(folder, "interview.mov");
        await writeFile(file, "VIDEO");
        routes["/graphicGenerator/jobs/fixed-id"] = { status: 409, body: "busy" };

        await expect(run(new CreateVggProject(), { "Video file path": file, "Project id": "fixed-id" })).rejects.toThrow(
            /is packaging a project with that id \(409\)/
        );
    });
});
