import { defaultProjectName, newVggProjectId } from "../../lib/nodes/CreateVggProject";

describe("newVggProjectId", () => {
    it("mints the draft id shape the Vulcano web client uses", () => {
        expect(newVggProjectId()).toMatch(/^draft_\d+_\w+$/);
    });

    it("does not repeat itself, so two runs never save over each other", () => {
        expect(new Set([newVggProjectId(), newVggProjectId(), newVggProjectId()]).size).toBe(3);
    });
});

describe("defaultProjectName", () => {
    it("uses the video file name without its extension", () => {
        expect(defaultProjectName("/Users/helmut/media/interview.mp4")).toBe("interview");
    });

    it("keeps a name that has no extension", () => {
        expect(defaultProjectName("/Users/helmut/media/interview")).toBe("interview");
    });
});
