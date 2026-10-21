import { describe, expect, it } from "vitest";
import { formatHourLabel, resolveLanguage, STRINGS, WEEKDAYS, t } from "./i18n";

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

describe("formatHourLabel", () => {
	it("labels the three special hours with their own strings", () => {
		expect(formatHourLabel(0, "en")).toBe("12 AM (00:00)");
		expect(formatHourLabel(12, "en")).toBe("12 PM (12:00)");
		expect(formatHourLabel(24, "en")).toBe("Midnight (24:00)");
	});

	it("renders the remaining hours with the AM/PM templates", () => {
		expect(formatHourLabel(9, "en")).toBe("9 AM");
		expect(formatHourLabel(21, "en")).toBe("9 PM");
	});

	it("uses the localized template for each language", () => {
		expect(formatHourLabel(0, "ko")).toBe("오전 12시 (00:00)");
		expect(formatHourLabel(9, "ko")).toBe("오전 9시");
		expect(formatHourLabel(21, "ko")).toBe("오후 9시");
		expect(formatHourLabel(24, "ko")).toBe("자정 (24:00)");
	});
});

describe("STRINGS", () => {
	it("has the exact same set of keys for every language", () => {
		const enKeys = Object.keys(STRINGS.en).sort();
		const koKeys = Object.keys(STRINGS.ko).sort();
		expect(koKeys).toEqual(enKeys);
	});

	it("keeps the %s placeholder in the windowed Event Time label", () => {
		// The label names the selected window, so the placeholder must
		// survive in both languages.
		expect(STRINGS.en.statEventTimeWindow).toContain("%s");
		expect(STRINGS.ko.statEventTimeWindow).toContain("%s");
	});
});

describe("WEEKDAYS", () => {
	it("has 7 entries per language", () => {
		expect(WEEKDAYS.en).toHaveLength(7);
		expect(WEEKDAYS.ko).toHaveLength(7);
	});
});
