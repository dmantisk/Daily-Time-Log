import { describe, expect, it } from "vitest";
import { resolveLanguage, STRINGS, WEEKDAYS, t } from "./i18n";

describe("t", () => {
	it("returns the string for the given language", () => {
		expect(t("btnSave", "en")).toBe("Save");
		expect(t("btnSave", "ko")).toBe("저장");
	});
});

describe("resolveLanguage", () => {
	it("follows Obsidian's Korean UI language in auto mode", () => {
		expect(resolveLanguage("auto", "ko")).toBe("ko");
	});

	it("falls back to English for unsupported Obsidian UI languages in auto mode", () => {
		expect(resolveLanguage("auto", "fr")).toBe("en");
	});

	it("preserves explicit language overrides", () => {
		expect(resolveLanguage("en", "ko")).toBe("en");
		expect(resolveLanguage("ko", "en")).toBe("ko");
	});
});

describe("STRINGS", () => {
	it("has the exact same set of keys for every language", () => {
		const enKeys = Object.keys(STRINGS.en).sort();
		const koKeys = Object.keys(STRINGS.ko).sort();
		expect(koKeys).toEqual(enKeys);
	});
});

describe("WEEKDAYS", () => {
	it("has 7 entries per language", () => {
		expect(WEEKDAYS.en).toHaveLength(7);
		expect(WEEKDAYS.ko).toHaveLength(7);
	});
});
