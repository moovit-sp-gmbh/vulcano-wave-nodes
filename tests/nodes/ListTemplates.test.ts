import { parseTotalCount, trimTemplate } from "../../lib/nodes/ListTemplates";

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

describe("trimTemplate", () => {
    it("keeps only the id and name of the template and the id, name and type of each property", () => {
        const property = {
            id: "41b7fe25",
            name: "Tag",
            group: "Text",
            preferenceType: "STRING",
            value: "Montag",
            matchNames: ["ADBE Text Document"],
            layerIndex: 3,
            parentCompID: 42,
            groupexpanded: true,
        };
        const template = { id: "/3Sat/Tag.mogrt", name: "Tag", assetType: "mogrt", status: "READY", properties: [property] };
        expect(trimTemplate(template)).toEqual({
            id: "/3Sat/Tag.mogrt",
            name: "Tag",
            properties: [{ id: "41b7fe25", name: "Tag", preferenceType: "STRING" }],
        });
    });

    it("gives a template without properties an empty list", () => {
        expect(trimTemplate({ id: "t" })).toEqual({ id: "t", name: "", properties: [] });
    });
});
