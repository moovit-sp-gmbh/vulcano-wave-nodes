import { toAssetProperties, unappliedPropertyIds } from "../../lib/nodes/CreateGraphic";

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

    it("stays silent when the response carries no properties to compare against", () => {
        expect(unappliedPropertyIds(sent, undefined)).toEqual([]);
        expect(unappliedPropertyIds(sent, [])).toEqual([]);
    });
});
