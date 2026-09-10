import Node from "../Node";
import axios, { AxiosRequestConfig } from "axios";
import {
    StreamNodeSpecificationInputType,
    StreamNodeSpecificationOutputType,
    StreamNodeSpecificationV3,
} from "hcloud-sdk/lib/interfaces/high5";
import { inputOr, redactToken, vulcanoError, vulcanoRequest } from "../helpers/vulcano-client";

const DEFAULT_TEMPLATE_FOLDER_ID = "root/Templates";
// Vulcano's own fallbacks are 20 / name / ascending, so the documented ones are sent explicitly.
const DEFAULT_MAX_RESULTS = 35;
const DEFAULT_SORT_BY = "created";
const DEFAULT_SORT_DIRECTION = "desc";

enum Input {
    VULCANO_URL = "Vulcano url",
    API_TOKEN = "Api token",
    TEMPLATE_FOLDER_ID = "Template folder id",
    SEARCH_QUERY = "Search query",
    MAX_RESULTS = "Max results",
    SORT_BY = "Sort by",
    SORT_DIRECTION = "Sort direction",
}

enum Output {
    TOTAL_COUNT = "Total count",
    TEMPLATE_IDS = "Template ids",
    TEMPLATE_NAMES = "Template names",
    TEMPLATES = "Templates",
    CURL = "Curl",
}

export interface TemplateAsset {
    id: string;
    name?: string;
}

/** Vulcano reports the folder's full size in X-Total-Count; the page length stands in if it is missing. */
export function parseTotalCount(header: unknown, fallback: number): number {
    if (header === undefined || header === null || String(header).trim() === "") return fallback;
    const total = Number(header);
    return Number.isInteger(total) && total >= 0 ? total : fallback;
}

export default class ListTemplates extends Node {
    specification: StreamNodeSpecificationV3 = {
        specVersion: 3,
        deprecated: false,
        name: "List templates",
        description: "Lists the templates in a Vulcano template folder",
        category: "Templates",
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
                name: Input.TEMPLATE_FOLDER_ID,
                description: "Enter the folder to list, including its subfolders — an unknown folder returns nothing",
                type: StreamNodeSpecificationInputType.STRING,
                example: DEFAULT_TEMPLATE_FOLDER_ID,
                defaultValue: DEFAULT_TEMPLATE_FOLDER_ID,
                mandatory: false,
            },
            {
                name: Input.SEARCH_QUERY,
                description: "Enter a search query to keep only templates matching it",
                type: StreamNodeSpecificationInputType.STRING,
                example: "lower third",
                mandatory: false,
            },
            {
                name: Input.MAX_RESULTS,
                description: "Enter the maximum number of templates to return",
                type: StreamNodeSpecificationInputType.NUMBER,
                example: 35,
                defaultValue: 35,
                mandatory: false,
                advanced: true,
            },
            {
                name: Input.SORT_BY,
                description: "Choose the field to sort the templates by",
                type: StreamNodeSpecificationInputType.STRING_SELECT,
                options: { Created: "created", Name: "name", "Last modified": "lastModified" },
                example: "created",
                defaultValue: "created",
                mandatory: false,
                advanced: true,
            },
            {
                name: Input.SORT_DIRECTION,
                description: "Choose whether to sort the templates ascending or descending",
                type: StreamNodeSpecificationInputType.STRING_SELECT,
                options: { Descending: "desc", Ascending: "asc" },
                example: "desc",
                defaultValue: "desc",
                mandatory: false,
                advanced: true,
            },
        ],
        outputs: [
            {
                name: Output.TOTAL_COUNT,
                description: "Returns how many templates the folder holds in total, for empty-result branching",
                type: StreamNodeSpecificationOutputType.NUMBER,
                example: 2,
            },
            {
                name: Output.TEMPLATE_IDS,
                description: "Returns the id of every template returned, to wire into Create graphic",
                type: StreamNodeSpecificationOutputType.STRING_LIST,
                example: ["/News/Lower third.mogrt"],
            },
            {
                name: Output.TEMPLATE_NAMES,
                description: "Returns the name of every template returned",
                type: StreamNodeSpecificationOutputType.STRING_LIST,
                example: ["Lower third"],
            },
            {
                name: Output.TEMPLATES,
                description: "Returns the full array of templates from Vulcano",
                type: StreamNodeSpecificationOutputType.JSON,
                example: [{ id: "/News/Lower third.mogrt", name: "Lower third", assetType: "mogrt" }],
            },
            {
                name: Output.CURL,
                description: "Returns the curl command equivalent of the request",
                type: StreamNodeSpecificationOutputType.STRING,
                example: 'curl -X GET -H "Authorization: Bearer <your-token>" "https://vulcano.example.com/assets"',
            },
        ],
    };

    async execute(): Promise<void> {
        const baseUrl = this.wave.inputs.getInputValueByInputName(Input.VULCANO_URL) as string;
        const apiToken = this.wave.inputs.getInputValueByInputName(Input.API_TOKEN) as string;
        const folderId = this.wave.inputs.getInputValueByInputName(Input.TEMPLATE_FOLDER_ID) as string | undefined;
        const searchQuery = this.wave.inputs.getInputValueByInputName(Input.SEARCH_QUERY) as string | undefined;
        const maxResults = inputOr(this.wave.inputs.getInputValueByInputName(Input.MAX_RESULTS), DEFAULT_MAX_RESULTS);
        const sortBy = inputOr(this.wave.inputs.getInputValueByInputName(Input.SORT_BY), DEFAULT_SORT_BY);
        const sortDirection = inputOr(this.wave.inputs.getInputValueByInputName(Input.SORT_DIRECTION), DEFAULT_SORT_DIRECTION);

        const requestConfig: AxiosRequestConfig = vulcanoRequest(baseUrl, apiToken, {
            method: "GET",
            url: "/assets",
            params: this.wave.axiosHelper.removeEmptyFields({
                id: inputOr(folderId?.trim(), DEFAULT_TEMPLATE_FOLDER_ID),
                search: searchQuery,
                page: 0,
                limit: maxResults,
                sortBy,
                sortDirection,
            }),
        });

        let templates: TemplateAsset[];
        let totalCount: number;
        try {
            // Raw axios, not the axios helper: the folder's total size only comes back as a header.
            const response = await axios(requestConfig);
            if (!Array.isArray(response.data)) throw new Error("the response is not a list of templates");
            templates = response.data;
            totalCount = parseTotalCount(response.headers["x-total-count"], templates.length);
        } catch (err: unknown) {
            // An unknown folder is not an error to Vulcano — it answers 200 with an empty list.
            throw vulcanoError("Could not list templates", err, "verify the Vulcano url and Api token");
        }

        this.wave.outputs.setOutput(Output.TOTAL_COUNT, totalCount);
        this.wave.outputs.setOutput(
            Output.TEMPLATE_IDS,
            templates.map((template) => template.id)
        );
        this.wave.outputs.setOutput(
            Output.TEMPLATE_NAMES,
            templates.map((template) => template.name ?? "")
        );
        this.wave.outputs.setOutput(Output.TEMPLATES, templates);
        this.wave.outputs.setOutput(Output.CURL, this.wave.axiosHelper.convertRequestToCurl(redactToken(requestConfig)));
    }
}
