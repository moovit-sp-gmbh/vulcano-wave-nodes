import { parseTotalCount } from "../../lib/nodes/ListTemplates";

describe("parseTotalCount", () => {
    it("reads the header Vulcano sends", () => {
        expect(parseTotalCount("128", 35)).toBe(128);
    });

    it("keeps a zero total instead of falling back", () => {
        expect(parseTotalCount("0", 35)).toBe(0);
    });

    it("falls back to the page length when the header is missing or blank", () => {
        expect(parseTotalCount(undefined, 35)).toBe(35);
        expect(parseTotalCount("  ", 35)).toBe(35);
    });

    it("falls back when the header is not a whole, positive number", () => {
        expect(parseTotalCount("many", 35)).toBe(35);
        expect(parseTotalCount("-1", 35)).toBe(35);
        expect(parseTotalCount("1.5", 35)).toBe(35);
    });
});
