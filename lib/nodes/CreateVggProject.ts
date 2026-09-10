import { randomBytes } from "node:crypto";
import path from "node:path";
import Node from "../Node";
import { AxiosRequestConfig } from "axios";
import {
    StreamNodeSpecificationInputType,
    StreamNodeSpecificationOutputType,
    StreamNodeSpecificationV3,
} from "hcloud-sdk/lib/interfaces/high5";
import Wave from "wave-engine/helpers/Wave";
import { isCanceled, withCancel } from "../helpers/cancellation";
import { NO_TIMEOUT, fileUploadForm, localFileSize, redactToken, vulcanoError, vulcanoRequest } from "../helpers/vulcano-client";

enum Input {
    VULCANO_URL = "Vulcano url",
    API_TOKEN = "Api token",
    VIDEO_FILE_PATH = "Video file path",
    PROJECT_NAME = "Project name",
    PROJECT_ID = "Project id",
}

enum Output {
    PROJECT_ID = "Project id",
    PROJECT_NAME = "Project name",
    BASE_VIDEO_PATH = "Base video path",
    PROJECT = "Project",
    CURL = "Curl",
}

export interface VggProject {
    id: string;
    name?: string;
    baseVideoPath?: string;
    status?: string;
}

/** Sends the video and answers with the path Vulcano stored it at. */
async function uploadBaseVideo(wave: Wave, config: AxiosRequestConfig): Promise<string> {
    try {
        return await wave.axiosHelper.makeRequest(config);
    } catch (err: unknown) {
        if (isCanceled(wave)) {
            throw new Error("Upload canceled — the stream was stopped — no action needed");
        }
        throw vulcanoError("Could not upload the base video", err, "verify the Vulcano url, Api token and Video file path", {
            400: "Vulcano rejected the video (400) — verify the Video file path is not an empty file",
            415: "Vulcano does not accept this video format (415) — use a supported video file",
            500: "Vulcano could not store the video (500) — check that its media folder is configured",
        });
    }
}

/** Writes the whole project, replacing whatever is stored under that id. */
async function saveProject(wave: Wave, config: AxiosRequestConfig): Promise<VggProject> {
    try {
        return await wave.axiosHelper.makeRequest(config);
    } catch (err: unknown) {
        if (isCanceled(wave)) {
            throw new Error("Save canceled — the stream was stopped — no action needed");
        }
        throw vulcanoError("Could not create vgg project", err, "verify the Vulcano url and Api token", {
            409: "Vulcano is packaging a project with that id (409) — wait for it to finish or use a different Project id",
        });
    }
}

/** Same draft_<time>_<random> shape the Vulcano web client mints for a new packaging job. */
export function newVggProjectId(): string {
    return `draft_${Date.now()}_${randomBytes(4).toString("hex")}`;
}

/** The web client names a new project after the uploaded video, so the node does too. */
export function defaultProjectName(videoFilePath: string): string {
    return path.basename(videoFilePath, path.extname(videoFilePath));
}

export default class CreateVggProject extends Node {
    specification: StreamNodeSpecificationV3 = {
        specVersion: 3,
        deprecated: false,
        name: "Create vgg project",
        description: "Creates a Video Graphic Generator project from a video in Vulcano",
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
                name: Input.VIDEO_FILE_PATH,
                description: "Enter the absolute path of the video file to use as the base video",
                type: StreamNodeSpecificationInputType.STRING,
                example: "/Users/helmut/media/interview.mp4",
                mandatory: true,
            },
            {
                name: Input.PROJECT_NAME,
                description: "Enter the name of the new project — leave empty to use the video file name",
                type: StreamNodeSpecificationInputType.STRING,
                example: "Interview",
                mandatory: false,
            },
            {
                name: Input.PROJECT_ID,
                description: "Enter the id of the new project — leave empty to generate a fresh draft id",
                type: StreamNodeSpecificationInputType.STRING,
                example: "draft_1757433600000_a1b2c3d4",
                mandatory: false,
                advanced: true,
            },
        ],
        outputs: [
            {
                name: Output.PROJECT_ID,
                description: "Returns the id of the new project, to wire into later packaging steps",
                type: StreamNodeSpecificationOutputType.STRING,
                example: "draft_1757433600000_a1b2c3d4",
            },
            {
                name: Output.PROJECT_NAME,
                description: "Returns the name of the new project",
                type: StreamNodeSpecificationOutputType.STRING,
                example: "Interview",
            },
            {
                name: Output.BASE_VIDEO_PATH,
                description: "Returns the server side path the uploaded video was stored at",
                type: StreamNodeSpecificationOutputType.STRING,
                example: "/vulcano/media/interview.mp4",
            },
            {
                name: Output.PROJECT,
                description: "Returns the full project object from Vulcano",
                type: StreamNodeSpecificationOutputType.JSON,
                example: { id: "draft_1757433600000_a1b2c3d4", name: "Interview", status: "DRAFT" },
            },
            {
                name: Output.CURL,
                description: "Returns the curl command equivalent of the request that saved the project",
                type: StreamNodeSpecificationOutputType.STRING,
                example: 'curl -X PUT -H "Authorization: Bearer <your-token>" https://vulcano.example.com/graphicGenerator/jobs/draft_1',
            },
        ],
    };

    async execute(): Promise<void> {
        const baseUrl = this.wave.inputs.getInputValueByInputName(Input.VULCANO_URL) as string;
        const apiToken = this.wave.inputs.getInputValueByInputName(Input.API_TOKEN) as string;
        const videoFilePath = this.wave.inputs.getInputValueByInputName(Input.VIDEO_FILE_PATH) as string;
        const projectNameInput = this.wave.inputs.getInputValueByInputName(Input.PROJECT_NAME) as string | undefined;
        const projectIdInput = this.wave.inputs.getInputValueByInputName(Input.PROJECT_ID) as string | undefined;

        const projectId = projectIdInput?.trim() || newVggProjectId();
        const projectName = projectNameInput?.trim() || defaultProjectName(videoFilePath);

        await localFileSize("Could not create vgg project", Input.VIDEO_FILE_PATH, videoFilePath);

        this.wave.logger.updateProgressAndMessage(0, `Uploading ${path.basename(videoFilePath)}`);
        const { project, saveConfig, baseVideoPath } = await withCancel(this.wave, async (signal) => {
            const uploadConfig = vulcanoRequest(baseUrl, apiToken, {
                method: "POST",
                url: "/graphicGenerator/uploadBaseVideo",
                data: await fileUploadForm("file", videoFilePath),
                // The timeout runs to the response, and a followed redirect buffers the body in memory.
                timeout: NO_TIMEOUT,
                maxRedirects: 0,
                signal,
                // The endpoint answers with a bare path, which is not valid JSON.
                responseType: "text",
            });
            const baseVideoPath = await uploadBaseVideo(this.wave, uploadConfig);

            this.wave.logger.updateProgressAndMessage(50, `Saving project ${projectName}`);
            const saveConfig: AxiosRequestConfig = vulcanoRequest(baseUrl, apiToken, {
                method: "PUT",
                url: `/graphicGenerator/jobs/${encodeURIComponent(projectId)}`,
                data: { id: projectId, name: projectName, baseVideoPath, overlays: [] },
                signal,
            });
            return { project: await saveProject(this.wave, saveConfig), saveConfig, baseVideoPath };
        });

        this.wave.outputs.setOutput(Output.PROJECT_ID, project.id ?? projectId);
        this.wave.outputs.setOutput(Output.PROJECT_NAME, project.name ?? projectName);
        this.wave.outputs.setOutput(Output.BASE_VIDEO_PATH, project.baseVideoPath ?? baseVideoPath);
        this.wave.outputs.setOutput(Output.PROJECT, project);
        this.wave.outputs.setOutput(Output.CURL, this.wave.axiosHelper.convertRequestToCurl(redactToken(saveConfig)));
    }
}
