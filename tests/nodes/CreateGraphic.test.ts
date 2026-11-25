import { mergeProperties, parsePropertyArray, toAssetProperties, unappliedPropertyIds } from "../../lib/nodes/CreateGraphic";

describe("toAssetProperties", () => {
    it("returns an empty list when no values were entered", () => {
        expect(toAssetProperties(undefined)).toEqual([]);
    });

    it("turns the map into the id/value pairs a reduced asset expects", () => {
        expect(toAssetProperties({ "prop-1": "Breaking news", "prop-2": "18:00" })).toEqual([
            { id: "prop-1", value: "Breaking news" },
            { id: "prop-2", value: "18:00" },
        ]);
    });

    it("stringifies values a wildcard resolved to a number", () => {
        expect(toAssetProperties({ "prop-1": 42 as unknown as string })).toEqual([{ id: "prop-1", value: "42" }]);
    });

    it("drops entries whose wildcard did not resolve", () => {
        const unresolved = "{{ output.abc.Body.result.response.values[1].id }}";
        expect(
            toAssetProperties({
                "prop-1": "Burscheid, Deutschland",
                [unresolved]: "{{ output.abc.Body.result.response.values[1].value }}",
                "prop-2": "{{ output.abc.missing }}",
            })
        ).toEqual([{ id: "prop-1", value: "Burscheid, Deutschland" }]);
    });
});

describe("unappliedPropertyIds", () => {
    const sent = [
        { id: "prop-1", value: "Breaking news" },
        { id: "headline", value: "Breaking news" },
    ];

    it("names the ids the template did not have", () => {
        expect(unappliedPropertyIds(sent, [{ id: "prop-1", value: "Breaking news" }])).toEqual(["headline"]);
    });

    it("reports nothing when every id was applied", () => {
        expect(unappliedPropertyIds(sent, [...sent, { id: "prop-9", value: "untouched" }])).toEqual([]);
    });

    it("names every id when the answer carries no properties at all", () => {
        expect(unappliedPropertyIds(sent, undefined)).toEqual(["prop-1", "headline"]);
        expect(unappliedPropertyIds(sent, [])).toEqual(["prop-1", "headline"]);
    });

    it("reports nothing when nothing was sent", () => {
        expect(unappliedPropertyIds([], undefined)).toEqual([]);
    });
});

describe("parsePropertyArray", () => {
    it("returns an empty list when nothing was entered", () => {
        expect(parsePropertyArray(undefined)).toEqual([]);
        expect(parsePropertyArray("  ")).toEqual([]);
    });

    it("reads the id/value objects of the array", () => {
        expect(parsePropertyArray('[{"id": "prop-1", "value": "Breaking news"}, {"id": "prop-2", "value": ""}]')).toEqual([
            { id: "prop-1", value: "Breaking news" },
            { id: "prop-2", value: "" },
        ]);
    });

    it("sends a value that is not a string as its json text", () => {
        expect(parsePropertyArray('[{"id": "n", "value": 42}, {"id": "t", "value": [["a", "b"]]}]')).toEqual([
            { id: "n", value: "42" },
            { id: "t", value: '[["a","b"]]' },
        ]);
    });

    it("drops entries whose wildcard did not resolve", () => {
        expect(parsePropertyArray('[{"id": "prop-1", "value": "{{ output.abc.missing }}"}]')).toEqual([]);
    });

    it("fails on text that is not a json array of id/value objects", () => {
        expect(() => parsePropertyArray("{not json")).toThrow("is not valid json");
        expect(() => parsePropertyArray('{"prop-1": "x"}')).toThrow("is not an array");
        expect(() => parsePropertyArray('[{"value": "x"}]')).toThrow("entry 0 has no id or no value");
        expect(() => parsePropertyArray('[{"id": "prop-1"}]')).toThrow("entry 0 has no id or no value");
        expect(() => parsePropertyArray("[null]")).toThrow("entry 0 has no id or no value");
    });
});

describe("mergeProperties", () => {
    it("lets the later list override an id given twice", () => {
        expect(
            mergeProperties(
                [
                    { id: "prop-1", value: "map" },
                    { id: "prop-2", value: "map" },
                ],
                [{ id: "prop-1", value: "array" }]
            )
        ).toEqual([
            { id: "prop-1", value: "array" },
            { id: "prop-2", value: "map" },
        ]);
    });
});
