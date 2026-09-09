import Node from "../Node";
import { DuplicateFileOption } from "wave-engine/models/DuplicateFileOptionEnum";
import {
    StreamNodeSpecificationInputType,
    StreamNodeSpecificationOutputType,
    StreamNodeSpecificationV3,
} from "hcloud-sdk/lib/interfaces/high5";
import { PROXY_FILE, downloadAssetFile } from "../helpers/vulcano-client";

enum Input {
    VULCANO_URL = "Vulcano url",
    API_TOKEN = "Api token",
    ASSET_ID = "Asset id",
    TARGET_FOLDER = "Target folder",
    FILE_NAME = "File name",
    DUPLICATE_FILE_OPTION = "Duplicate file option",
}

enum Output {
    FILE_PATH = "File path",
    FILE_SIZE = "File size",
}

export default class DownloadProxyFile extends Node {
    specification: StreamNodeSpecificationV3 = {
        specVersion: 3,
        deprecated: false,
        name: "Download proxy file",
        description: "Downloads the proxy file of an asset from Vulcano",
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
                name: Input.ASSET_ID,
                description: "Enter the id of the asset to download the proxy file of",
                type: StreamNodeSpecificationInputType.STRING,
                example: "b3f0a1c2-9d44-4e18-8a77-2c1b5e6f0a91",
                mandatory: true,
            },
            {
                name: Input.TARGET_FOLDER,
                description: "Enter the absolute path of the folder to save the file in",
                type: StreamNodeSpecificationInputType.STRING,
                example: "/Users/helmut/downloads",
                mandatory: true,
            },
            {
                name: Input.FILE_NAME,
                description: "Enter the file name to save the download as",
                type: StreamNodeSpecificationInputType.STRING,
                example: "lower-third-01-proxy.mp4",
                mandatory: true,
            },
            {
                name: Input.DUPLICATE_FILE_OPTION,
                description: "Choose how to handle an existing file with the same name",
                type: StreamNodeSpecificationInputType.STRING_SELECT,
                options: {
                    Fail: DuplicateFileOption.FAIL,
                    Skip: DuplicateFileOption.SKIP,
                    Overwrite: DuplicateFileOption.OVERWRITE,
                    "Rename existing": DuplicateFileOption.RENAME_EXISTING,
                    "Increment name": DuplicateFileOption.INCREMENT_NAME,
                },
                example: DuplicateFileOption.FAIL,
                defaultValue: DuplicateFileOption.FAIL,
                mandatory: false,
                advanced: true,
            },
        ],
        outputs: [
            {
                name: Output.FILE_PATH,
                description: "Returns the final path of the downloaded file",
                type: StreamNodeSpecificationOutputType.STRING,
                example: "/Users/helmut/downloads/lower-third-01-proxy.mp4",
            },
            {
                name: Output.FILE_SIZE,
                description: "Returns the size of the downloaded file in bytes",
                type: StreamNodeSpecificationOutputType.NUMBER,
                example: 20480,
            },
        ],
    };

    async execute(): Promise<void> {
        const { filePath, fileSize } = await downloadAssetFile(this.wave, {
            baseUrl: this.wave.inputs.getInputValueByInputName(Input.VULCANO_URL) as string,
            apiToken: this.wave.inputs.getInputValueByInputName(Input.API_TOKEN) as string,
            ...PROXY_FILE,
            assetId: this.wave.inputs.getInputValueByInputName(Input.ASSET_ID) as string,
            targetFolder: this.wave.inputs.getInputValueByInputName(Input.TARGET_FOLDER) as string,
            fileName: this.wave.inputs.getInputValueByInputName(Input.FILE_NAME) as string,
            duplicateFileOption: this.wave.inputs.getInputValueByInputName(Input.DUPLICATE_FILE_OPTION) as DuplicateFileOption,
        });

        this.wave.outputs.setOutput(Output.FILE_PATH, filePath);
        this.wave.outputs.setOutput(Output.FILE_SIZE, fileSize);
    }
}
