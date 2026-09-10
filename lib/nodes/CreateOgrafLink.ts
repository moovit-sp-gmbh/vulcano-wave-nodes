import Node from "../Node";
import { AxiosRequestConfig } from "axios";
import {
    StreamNodeSpecificationInputType,
    StreamNodeSpecificationOutputType,
    StreamNodeSpecificationV3,
} from "hcloud-sdk/lib/interfaces/high5";
import { normalizeBaseUrl, numberOr, redactToken, vulcanoError, vulcanoRequest } from "../helpers/vulcano-client";

const DEFAULT_EXPIRY_DAYS = 30;

enum Input {
    VULCANO_URL = "Vulcano url",
    API_TOKEN = "Api token",
    ASSET_ID = "Asset id",
    LINK_EXPIRY_DAYS = "Link expiry days",
    LINK_LABEL = "Link label",
    LINK_CONTROL_VALUES = "Link control values",
}

enum Output {
    LINK_ID = "Link id",
    LINK_TOKEN = "Link token",
    PLAYER_URL = "Player url",
    OGRAF_LINK = "Ograf link",
    CURL = "Curl",
}

export interface OgrafLink {
    id: string;
    token: string;
    label?: string;
    expiresAt?: string;
    status?: string;
}

/** House style has no JSON input type, so the control values arrive as text and are checked here. */
export function parseLinkControlValues(raw: string | undefined): Record<string, unknown> | undefined {
    if (raw === undefined || raw.trim().length === 0) return undefined;

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new Error(
            'Could not create ograf link — Link control values is not valid JSON — enter a JSON object, e.g. {"headline":"Hello"}'
        );
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error(
            "Could not create ograf link — Link control values is not a JSON object — enter a JSON object, not an array or primitive"
        );
    }
    return parsed as Record<string, unknown>;
}

/** The player reads the link token from `link`; `token` is reserved for the api bearer token. */
export function ografPlayerUrl(baseUrl: string, token: string): string {
    return `${normalizeBaseUrl(baseUrl)}/ograf-player.html?link=${encodeURIComponent(token)}`;
}

export default class CreateOgrafLink extends Node {
    specification: StreamNodeSpecificationV3 = {
        specVersion: 3,
        deprecated: false,
        name: "Create ograf link",
        description: "Creates a shareable OGraf player link for an asset in Vulcano",
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
                description: "Enter the id of the asset to share — it must have an OGraf bundle",
                type: StreamNodeSpecificationInputType.STRING,
                example: "b3f0a1c2-9d44-4e18-8a77-2c1b5e6f0a91",
                mandatory: true,
            },
            {
                name: Input.LINK_EXPIRY_DAYS,
                description: "Enter the number of days the link stays valid, between 1 and 365",
                type: StreamNodeSpecificationInputType.NUMBER,
                example: 30,
                defaultValue: 30,
                mandatory: false,
                advanced: true,
            },
            {
                name: Input.LINK_LABEL,
                description: "Enter a label to recognise the link by in the Vulcano user interface",
                type: StreamNodeSpecificationInputType.STRING,
                example: "Newsroom preview",
                mandatory: false,
                advanced: true,
            },
            {
                name: Input.LINK_CONTROL_VALUES,
                description: "Enter the control values the player starts with (JSON object)",
                type: StreamNodeSpecificationInputType.STRING_LONG,
                example: '{"headline":"Breaking news"}',
                mandatory: false,
                advanced: true,
            },
        ],
        outputs: [
            {
                name: Output.LINK_ID,
                description: "Returns the id of the new link, to revoke it later",
                type: StreamNodeSpecificationOutputType.STRING,
                example: "0d5c1a7e-88b3-4f2a-91cc-5e7d3b2a1f04",
            },
            {
                name: Output.LINK_TOKEN,
                description: "Returns the token that grants access to the shared graphic",
                type: StreamNodeSpecificationOutputType.STRING,
                example: "Zm9vYmFyLXRva2VuLTEyMw",
            },
            {
                name: Output.PLAYER_URL,
                description: "Returns the ready to share OGraf player url for the asset",
                type: StreamNodeSpecificationOutputType.STRING,
                example: "https://vulcano.example.com/ograf-player.html?link=Zm9vYmFyLXRva2VuLTEyMw",
            },
            {
                name: Output.OGRAF_LINK,
                description: "Returns the full link object from Vulcano",
                type: StreamNodeSpecificationOutputType.JSON,
                example: {
                    id: "0d5c1a7e-88b3-4f2a-91cc-5e7d3b2a1f04",
                    token: "Zm9vYmFyLXRva2VuLTEyMw",
                    status: "ACTIVE",
                },
            },
            {
                name: Output.CURL,
                description: "Returns the curl command equivalent of the request",
                type: StreamNodeSpecificationOutputType.STRING,
                example: 'curl -X POST -H "Authorization: Bearer <your-token>" https://vulcano.example.com/assets/ograf/links',
            },
        ],
    };

    async execute(): Promise<void> {
        const baseUrl = this.wave.inputs.getInputValueByInputName(Input.VULCANO_URL) as string;
        const apiToken = this.wave.inputs.getInputValueByInputName(Input.API_TOKEN) as string;
        const assetId = this.wave.inputs.getInputValueByInputName(Input.ASSET_ID) as string;
        const expiryDays = numberOr(this.wave.inputs.getInputValueByInputName(Input.LINK_EXPIRY_DAYS), DEFAULT_EXPIRY_DAYS);
        const label = this.wave.inputs.getInputValueByInputName(Input.LINK_LABEL) as string | undefined;
        const controlValuesRaw = this.wave.inputs.getInputValueByInputName(Input.LINK_CONTROL_VALUES) as string | undefined;
        const data = parseLinkControlValues(controlValuesRaw);

        const requestConfig: AxiosRequestConfig = vulcanoRequest(baseUrl, apiToken, {
            method: "POST",
            url: "/assets/ograf/links",
            params: { assetId },
            // Built by hand: removeEmptyFields would also strip empty control values the user set on purpose.
            data: { expiryDays, ...(label ? { label } : {}), ...(data ? { data } : {}) },
        });

        let link: OgrafLink;
        try {
            link = await this.wave.axiosHelper.makeRequest(requestConfig);
        } catch (err: unknown) {
            throw vulcanoError("Could not create ograf link", err, "verify the Vulcano url, Api token and Asset id", {
                400: "Vulcano rejected the request (400) — Link expiry days must be a whole number between 1 and 365",
                404: "Vulcano has no OGraf bundle for that Asset id (404) — verify the asset was converted to OGraf",
            });
        }

        if (!link.token) {
            throw new Error("Could not create ograf link — Vulcano returned a link without a token — verify the asset has an OGraf bundle");
        }

        this.wave.outputs.setOutput(Output.LINK_ID, link.id);
        this.wave.outputs.setOutput(Output.LINK_TOKEN, link.token);
        this.wave.outputs.setOutput(Output.PLAYER_URL, ografPlayerUrl(baseUrl, link.token));
        this.wave.outputs.setOutput(Output.OGRAF_LINK, link);
        this.wave.outputs.setOutput(Output.CURL, this.wave.axiosHelper.convertRequestToCurl(redactToken(requestConfig)));
    }
}
