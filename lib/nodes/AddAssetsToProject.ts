import Node from "../Node";
import { AxiosRequestConfig } from "axios";
import {
    StreamNodeSpecificationInputType,
    StreamNodeSpecificationOutputType,
    StreamNodeSpecificationV3,
} from "hcloud-sdk/lib/interfaces/high5";
import { redactToken, vulcanoError, vulcanoRequest } from "../helpers/vulcano-client";

enum Input {
    VULCANO_URL = "Vulcano url",
    API_TOKEN = "Api token",
    PROJECT_ID = "Project id",
    ASSET_IDS = "Asset ids",
    TARGET_LOCATION = "Target location",
}

enum Output {
    PROJECT_ID = "Project id",
    SENT_ASSET_COUNT = "Sent asset count",
    CURL = "Curl",
}

/** Drops blank entries so a wildcard-fed list cannot post empty asset ids. */
export function normalizeAssetIds(rawIds: string[] | undefined): string[] {
    const ids = (rawIds ?? []).map((id) => String(id).trim()).filter((id) => id.length > 0);
    if (ids.length === 0) {
        throw new Error("Could not add assets — Asset ids is empty — wire at least one asset id into the input");
    }
    return ids;
}

export default class AddAssetsToProject extends Node {
    specification: StreamNodeSpecificationV3 = {
        specVersion: 3,
        deprecated: false,
        name: "Add assets to project",
        description: "Adds existing assets to a project in Vulcano",
        category: "Projects",
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
                name: Input.PROJECT_ID,
                description: "Enter the id of the project the assets are added to — an unknown id creates that project",
                type: StreamNodeSpecificationInputType.STRING,
                example: "7c9a1f02-5e33-42d1-9f88-1b2c3d4e5f60",
                mandatory: true,
            },
            {
                name: Input.ASSET_IDS,
                description: "Enter the id of every asset to add to the project",
                type: StreamNodeSpecificationInputType.STRING_LIST,
                example: ["b3f0a1c2-9d44-4e18-8a77-2c1b5e6f0a91"],
                mandatory: true,
            },
            {
                name: Input.TARGET_LOCATION,
                description: "Enter the folder inside the project to place the assets in",
                type: StreamNodeSpecificationInputType.STRING,
                example: "/Sendung/Grafiken",
                mandatory: false,
                advanced: true,
            },
        ],
        outputs: [
            {
                name: Output.PROJECT_ID,
                description: "Returns the id of the project the assets were added to",
                type: StreamNodeSpecificationOutputType.STRING,
                example: "7c9a1f02-5e33-42d1-9f88-1b2c3d4e5f60",
            },
            {
                name: Output.SENT_ASSET_COUNT,
                description: "Returns how many asset ids were sent — Vulcano skips ids it does not know",
                type: StreamNodeSpecificationOutputType.NUMBER,
                example: 2,
            },
            {
                name: Output.CURL,
                description: "Returns the curl command equivalent of the request",
                type: StreamNodeSpecificationOutputType.STRING,
                example: 'curl -X POST -H "Authorization: Bearer <your-token>" https://vulcano.example.com/projects',
            },
        ],
    };

    async execute(): Promise<void> {
        const baseUrl = this.wave.inputs.getInputValueByInputName(Input.VULCANO_URL) as string;
        const apiToken = this.wave.inputs.getInputValueByInputName(Input.API_TOKEN) as string;
        const projectId = this.wave.inputs.getInputValueByInputName(Input.PROJECT_ID) as string;
        const assetIds = normalizeAssetIds(this.wave.inputs.getInputValueByInputName(Input.ASSET_IDS) as string[]);
        const location = this.wave.inputs.getInputValueByInputName(Input.TARGET_LOCATION) as string | undefined;

        const requestConfig: AxiosRequestConfig = vulcanoRequest(baseUrl, apiToken, {
            method: "POST",
            url: "/projects",
            params: this.wave.axiosHelper.removeEmptyFields({ projectID: projectId, location }),
            data: assetIds,
        });

        try {
            await this.wave.axiosHelper.makeRequest(requestConfig);
        } catch (err: unknown) {
            throw vulcanoError("Could not add assets", err, "verify the Vulcano url, Api token and Project id", {
                500: "Vulcano could not add the assets (500) — check the Vulcano log for the failing asset id",
            });
        }

        this.wave.outputs.setOutput(Output.PROJECT_ID, projectId);
        this.wave.outputs.setOutput(Output.SENT_ASSET_COUNT, assetIds.length);
        this.wave.outputs.setOutput(Output.CURL, this.wave.axiosHelper.convertRequestToCurl(redactToken(requestConfig)));
    }
}
