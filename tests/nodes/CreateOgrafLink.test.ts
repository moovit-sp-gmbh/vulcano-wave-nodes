import { ografPlayerUrl, parseLinkControlValues } from "../../lib/nodes/CreateOgrafLink";

describe("parseLinkControlValues", () => {
    it("returns undefined when nothing was entered", () => {
        expect(parseLinkControlValues(undefined)).toBeUndefined();
        expect(parseLinkControlValues("   ")).toBeUndefined();
    });

    it("parses a JSON object", () => {
        expect(parseLinkControlValues('{"headline":"Hello"}')).toEqual({ headline: "Hello" });
    });

    it("throws a three-part error on invalid JSON", () => {
        expect(() => parseLinkControlValues("{not json")).toThrow(/not valid JSON/);
    });

    it("throws a three-part error when the JSON value is not an object", () => {
        expect(() => parseLinkControlValues("[1,2]")).toThrow(/not a JSON object/);
        expect(() => parseLinkControlValues("42")).toThrow(/not a JSON object/);
    });
});

describe("ografPlayerUrl", () => {
    it("builds the player url on the link parameter", () => {
        expect(ografPlayerUrl("https://vulcano.example.com", "abc123")).toBe("https://vulcano.example.com/ograf-player.html?link=abc123");
    });

    it("tolerates a trailing slash and escapes the token", () => {
        expect(ografPlayerUrl("https://vulcano.example.com/", "a+b/c")).toBe(
            "https://vulcano.example.com/ograf-player.html?link=a%2Bb%2Fc"
        );
    });
});
