import { parseTotalCount, templateTextFields } from "../../lib/nodes/ListTemplates";

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

describe("templateTextFields", () => {
    const headline = {
        id: "7f291db7",
        name: "Headline",
        group: "Text",
        preferenceType: "STRING",
        allowLineBreaks: true,
        maxChars: -1,
        required: false,
        value: "Headline 80-100px\nzwei Zeilen",
        matchNames: ["ADBE Text Document"],
        layerIndex: 3,
        parentCompID: 42,
        groupexpanded: true,
    };

    it("keeps only the fillable text fields with their id and the details an LLM needs", () => {
        const result = templateTextFields([
            {
                id: "/News/Lower third.mogrt",
                name: "Lower third",
                properties: [
                    headline,
                    { id: "limited", name: "Name", preferenceType: "STRING", maxChars: 30, required: true, value: "" },
                    { id: "check", preferenceType: "CHECKBOX", value: true },
                    { id: "select", preferenceType: "SELECT", value: "a" },
                    { id: "slider", preferenceType: "SLIDER", value: 5 },
                    { id: "comment", preferenceType: "COMMENT", value: "note" },
                    { id: "hidden", preferenceType: "STRING", hidden: true },
                    { id: "locked", preferenceType: "STRING", editable: false },
                ],
            },
        ]);
        expect(result).toEqual([
            {
                id: "/News/Lower third.mogrt",
                name: "Lower third",
                textFields: [
                    {
                        id: "7f291db7",
                        name: "Headline",
                        group: "Text",
                        value: "Headline 80-100px\nzwei Zeilen",
                        allowLineBreaks: true,
                        required: false,
                    },
                    { id: "limited", name: "Name", group: "", value: "", maxChars: 30, allowLineBreaks: false, required: true },
                ],
            },
        ]);
    });

    it("returns no text fields for a template without properties", () => {
        expect(templateTextFields([{ id: "t" }])).toEqual([{ id: "t", name: "", textFields: [] }]);
    });
});
