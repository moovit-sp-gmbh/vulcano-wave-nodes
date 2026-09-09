import { assertMogrtPath } from "../../lib/nodes/UploadMogrt";

describe("assertMogrtPath", () => {
    it("accepts a mogrt file whatever the case of the extension", () => {
        expect(() => assertMogrtPath("/tmp/Lower third.mogrt")).not.toThrow();
        expect(() => assertMogrtPath("/tmp/Lower third.MOGRT")).not.toThrow();
    });

    it("throws a three-part error for anything else", () => {
        expect(() => assertMogrtPath("/tmp/clip.mp4")).toThrow(/not a \.mogrt file/);
        expect(() => assertMogrtPath("/tmp/clip")).toThrow(/not a \.mogrt file/);
    });
});
