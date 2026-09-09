import { normalizeAssetIds } from "../../lib/nodes/AddAssetsToProject";

describe("normalizeAssetIds", () => {
    it("trims the ids and drops blank entries", () => {
        expect(normalizeAssetIds([" asset-1 ", "", "asset-2", "   "])).toEqual(["asset-1", "asset-2"]);
    });

    it("throws a three-part error when nothing is left to add", () => {
        expect(() => normalizeAssetIds(["  "])).toThrow(/Asset ids is empty/);
        expect(() => normalizeAssetIds(undefined)).toThrow(/Asset ids is empty/);
    });
});
