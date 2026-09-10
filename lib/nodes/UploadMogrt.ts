import path from "node:path";
import Node from "../Node";
import {
    StreamNodeSpecificationInputType,
    StreamNodeSpecificationOutputType,
    StreamNodeSpecificationV3,
} from "hcloud-sdk/lib/interfaces/high5";
import { abortWhenCanceled, isCanceled } from "../helpers/cancellation";
import { NO_TIMEOUT, fileUploadForm, localFileSize, vulcanoError, vulcanoRequest } from "../helpers/vulcano-client";

enum Input {
    VULCANO_URL = "Vulcano url",
    API_TOKEN = "Api token",
    TREE_NODE_ID = "Tree node id",
    MOGRT_FILE_PATH = "Mogrt file path",
}

enum Output {
    UPLOADED_FILE_NAME = "Uploaded file name",
    FILE_SIZE = "File size",
}

/** Vulcano only analyses .mogrt uploads, so a wrong file is caught before it is sent. */
export function assertMogrtPath(filePath: string): void {
    if (path.extname(filePath).toLowerCase() !== ".mogrt") {
        throw new Error("Could not upload mogrt — Mogrt file path is not a .mogrt file — point the input at a Motion Graphics template");
    }
}

export default class UploadMogrt extends Node {
    specification: StreamNodeSpecificationV3 = {
        specVersion: 3,
        deprecated: false,
        name: "Upload mogrt",
        description: "Uploads a mogrt file to a template folder in Vulcano",
        category: "Assets",
        version: { major: 1, minor: 0, patch: 0, changelog: ["Initial release"] },
        author: { name: "MoovIT Software Products", company: "MoovIT GmbH", email: "info@moovit.de" },
        inputs: [
            {
                name: Input.VULCANO_URL,
                description: "Enter the base url of the Vulcano instance",
                type: StreamNodeSpecificationInputType.STRING,
                example: "https://vulcano.example.com",
                mandatory: true,
            },
            {
                name: Input.API_TOKEN,
                description: "Enter the service token generated in the Vulcano user interface",
                type: StreamNodeSpecificationInputType.STRING_PASSWORD,
                example: "vt_9f4Ac2Kd1QeR7tYu0pZxLm3Nb6Vs8Wq2",
                mandatory: true,
            },
            {
                name: Input.TREE_NODE_ID,
                description: "Enter the id of the template tree node to upload into — an unknown id creates that folder",
                type: StreamNodeSpecificationInputType.STRING,
                example: "News",
                mandatory: true,
            },
            {
                name: Input.MOGRT_FILE_PATH,
                description: "Enter the absolute path of the mogrt file to upload",
                type: StreamNodeSpecificationInputType.STRING,
                example: "/Users/helmut/templates/Lower third.mogrt",
                mandatory: true,
            },
        ],
        outputs: [
            {
                name: Output.UPLOADED_FILE_NAME,
                description: "Returns the file name the mogrt was stored under in Vulcano",
                type: StreamNodeSpecificationOutputType.STRING,
                example: "Lower third.mogrt",
            },
            {
                name: Output.FILE_SIZE,
                description: "Returns the size of the uploaded file in bytes",
                type: StreamNodeSpecificationOutputType.NUMBER,
                example: 1048576,
            },
        ],
    };

    async execute(): Promise<void> {
        const baseUrl = this.wave.inputs.getInputValueByInputName(Input.VULCANO_URL) as string;
        const apiToken = this.wave.inputs.getInputValueByInputName(Input.API_TOKEN) as string;
        const treeNodeId = this.wave.inputs.getInputValueByInputName(Input.TREE_NODE_ID) as string;
        const mogrtFilePath = this.wave.inputs.getInputValueByInputName(Input.MOGRT_FILE_PATH) as string;

        assertMogrtPath(mogrtFilePath);
        const fileSize = await localFileSize("Could not upload mogrt", Input.MOGRT_FILE_PATH, mogrtFilePath);

        this.wave.logger.updateProgressAndMessage(0, `Uploading ${path.basename(mogrtFilePath)}`);
        const cancel = abortWhenCanceled(this.wave);
        try {
            // An unknown Tree node id is not an error to Vulcano — it creates the folder.
            const requestConfig = vulcanoRequest(baseUrl, apiToken, {
                method: "POST",
                url: "/files",
                params: { nodeId: treeNodeId },
                data: await fileUploadForm("filename", mogrtFilePath),
                // The timeout runs to the response, and a followed redirect buffers the body in memory.
                timeout: NO_TIMEOUT,
                maxRedirects: 0,
                signal: cancel.signal,
            });
            try {
                await this.wave.axiosHelper.makeRequest(requestConfig);
            } catch (err: unknown) {
                if (isCanceled(this.wave)) {
                    throw new Error("Upload canceled — the stream was stopped — no action needed");
                }
                throw vulcanoError("Could not upload mogrt", err, "verify the Vulcano url, Api token and Tree node id", {
                    403: "Vulcano rejected the upload (403) — uploading templates needs an admin service token",
                    500: "Vulcano could not store the file (500) — verify the Tree node id and the Vulcano templates folder",
                });
            }
        } finally {
            cancel.stop();
        }

        this.wave.outputs.setOutput(Output.UPLOADED_FILE_NAME, path.basename(mogrtFilePath));
        this.wave.outputs.setOutput(Output.FILE_SIZE, fileSize);
    }
}
