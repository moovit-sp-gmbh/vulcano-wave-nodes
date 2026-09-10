import Node from "../Node";
import { AxiosRequestConfig } from "axios";
import {
    StreamNodeSpecificationInputType,
    StreamNodeSpecificationOutputType,
    StreamNodeSpecificationV3,
} from "hcloud-sdk/lib/interfaces/high5";
import { numberOr, redactToken, vulcanoError, vulcanoRequest } from "../helpers/vulcano-client";

enum Input {
    VULCANO_URL = "Vulcano url",
    API_TOKEN = "Api token",
    TEMPLATE_ASSET_ID = "Template asset id",
    GRAPHIC_PROPERTY_VALUES = "Graphic property values",
    VULCANO_USER = "Vulcano user",
    OUTPUT_FILE_NAME = "Output file name",
    OUTPUT_DURATION_SECONDS = "Output duration seconds",
}

enum Output {
    GRAPHIC_ID = "Graphic id",
    GRAPHIC_STATUS = "Graphic status",
    GRAPHIC_NAME = "Graphic name",
    GRAPHIC = "Graphic",
    CURL = "Curl",
}

export interface AssetProperty {
    id: string;
    value: string;
}

export interface VulcanoAsset {
    id: string;
    name?: string;
    status?: string;
    properties?: AssetProperty[];
    outputDurationSeconds?: number;
}

/** Turns the Graphic property values map into the property array a reduced asset expects. */
export function toAssetProperties(values: Record<string, string> | undefined): AssetProperty[] {
    if (!values) return [];
    return Object.entries(values).map(([id, value]) => ({ id, value: String(value) }));
}

// Vulcano drops property ids the template does not own and still answers 200, so the
// returned ids are the only proof a value was applied.
export function unappliedPropertyIds(sent: AssetProperty[], returned: AssetProperty[] | undefined): string[] {
    // An answer with no properties at all means every value sent was dropped.
    const applied = new Set((returned ?? []).map((property) => property.id));
    return sent.filter((property) => !applied.has(property.id)).map((property) => property.id);
}

export default class CreateGraphic extends Node {
    specification: StreamNodeSpecificationV3 = {
        specVersion: 3,
        deprecated: false,
        name: "Create graphic",
        description: "Creates a new asset from a template in Vulcano",
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
                name: Input.TEMPLATE_ASSET_ID,
                description: "Enter the id of the template asset the graphic is created from",
                type: StreamNodeSpecificationInputType.STRING,
                example: "/News/Lower third.mogrt",
                mandatory: true,
            },
            {
                name: Input.VULCANO_USER,
                description: "Enter the Vulcano user the new graphic is created for",
                type: StreamNodeSpecificationInputType.STRING,
                example: "jdoe",
                mandatory: true,
            },
            {
                name: Input.GRAPHIC_PROPERTY_VALUES,
                description: "Enter the property values to fill in, keyed by property id — leave empty to use the template defaults",
                type: StreamNodeSpecificationInputType.STRING_MAP,
                example: { "6f1c1d24-6a63-4d9b-9a0e-6f5a2a4d1c88": "Breaking news" },
                mandatory: false,
            },
            {
                name: Input.OUTPUT_FILE_NAME,
                description: "Enter the file name for the rendered graphic — leave empty to use the Vulcano naming pattern",
                type: StreamNodeSpecificationInputType.STRING,
                example: "lower-third-01",
                mandatory: false,
                advanced: true,
            },
            {
                name: Input.OUTPUT_DURATION_SECONDS,
                description: "Enter the render duration in seconds — 0 keeps the template duration",
                type: StreamNodeSpecificationInputType.NUMBER,
                example: 10,
                defaultValue: 0,
                mandatory: false,
                advanced: true,
            },
        ],
        outputs: [
            {
                name: Output.GRAPHIC_ID,
                description: "Returns the id of the newly created graphic",
                type: StreamNodeSpecificationOutputType.STRING,
                example: "b3f0a1c2-9d44-4e18-8a77-2c1b5e6f0a91",
            },
            {
                name: Output.GRAPHIC_STATUS,
                description: "Returns the render status of the new graphic, for branching on the result",
                type: StreamNodeSpecificationOutputType.STRING,
                example: "QUEUED",
            },
            {
                name: Output.GRAPHIC_NAME,
                description: "Returns the name of the newly created graphic",
                type: StreamNodeSpecificationOutputType.STRING,
                example: "lower-third-01",
            },
            {
                name: Output.GRAPHIC,
                description: "Returns the full asset object from Vulcano",
                type: StreamNodeSpecificationOutputType.JSON,
                example: { id: "b3f0a1c2-9d44-4e18-8a77-2c1b5e6f0a91", name: "lower-third-01", status: "QUEUED" },
            },
            {
                name: Output.CURL,
                description: "Returns the curl command equivalent of the request",
                type: StreamNodeSpecificationOutputType.STRING,
                example: 'curl -X POST -H "Authorization: Bearer <your-token>" https://vulcano.example.com/assets',
            },
        ],
    };

    async execute(): Promise<void> {
        const baseUrl = this.wave.inputs.getInputValueByInputName(Input.VULCANO_URL) as string;
        const apiToken = this.wave.inputs.getInputValueByInputName(Input.API_TOKEN) as string;
        const templateAssetId = this.wave.inputs.getInputValueByInputName(Input.TEMPLATE_ASSET_ID) as string;
        const user = this.wave.inputs.getInputValueByInputName(Input.VULCANO_USER) as string;
        const propertyValues = this.wave.inputs.getInputValueByInputName(Input.GRAPHIC_PROPERTY_VALUES) as
            | Record<string, string>
            | undefined;
        const fileName = this.wave.inputs.getInputValueByInputName(Input.OUTPUT_FILE_NAME) as string | undefined;
        const outputDurationSeconds = numberOr(this.wave.inputs.getInputValueByInputName(Input.OUTPUT_DURATION_SECONDS), 0);

        const properties = toAssetProperties(propertyValues);
        const requestConfig: AxiosRequestConfig = vulcanoRequest(baseUrl, apiToken, {
            method: "POST",
            url: "/assets",
            // reduced=true: Vulcano merges these values onto the stored template asset.
            params: this.wave.axiosHelper.removeEmptyFields({ user, reduced: true, filename: fileName }),
            // Zero and absent both mean the template duration, so the field is only sent when it is set.
            data: { id: templateAssetId, properties, ...(outputDurationSeconds > 0 ? { outputDurationSeconds } : {}) },
        });

        let graphic: VulcanoAsset;
        try {
            graphic = await this.wave.axiosHelper.makeRequest(requestConfig);
        } catch (err: unknown) {
            throw vulcanoError("Could not create graphic", err, "verify the Vulcano url, Api token and Template asset id", {
                400: "Vulcano rejected the request (400) — verify Vulcano user names an existing user",
                404: "Vulcano has no asset with that Template asset id (404) — verify the Template asset id",
            });
        }

        // Vulcano answers 200 after discarding what it would not apply, so both are checked here.
        const dropped = unappliedPropertyIds(properties, graphic.properties);
        if (dropped.length > 0) {
            throw new Error(
                `Could not create graphic — Vulcano ignored the property ids ${dropped.join(", ")} because the template does not define them — verify Graphic property values against the template, then delete graphic ${graphic.id}`
            );
        }
        if (outputDurationSeconds > 0 && graphic.outputDurationSeconds !== outputDurationSeconds) {
            const applied =
                typeof graphic.outputDurationSeconds === "number" ? `${graphic.outputDurationSeconds}s` : "the template duration";
            throw new Error(
                `Could not create graphic — Vulcano applied ${applied} instead of the requested ${outputDurationSeconds}s, which it allows only within 100 seconds of the template length — adjust Output duration seconds, then delete graphic ${graphic.id}`
            );
        }

        this.wave.outputs.setOutput(Output.GRAPHIC_ID, graphic.id);
        this.wave.outputs.setOutput(Output.GRAPHIC_STATUS, graphic.status ?? "");
        this.wave.outputs.setOutput(Output.GRAPHIC_NAME, graphic.name ?? "");
        this.wave.outputs.setOutput(Output.GRAPHIC, graphic);
        this.wave.outputs.setOutput(Output.CURL, this.wave.axiosHelper.convertRequestToCurl(redactToken(requestConfig)));
    }
}
