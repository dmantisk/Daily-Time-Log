import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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

	it("has no dead keys — every string is actually referenced by the code", () => {
		// A key that nothing reads is dead weight in both language tables,
		// and it cannot be dropped from one side alone (the key-set parity
		// test above would fail). This scans the whole source tree for each
		// key's use as a quoted literal — `t("key")`, but also the ternary
		// forms like `t(isDaily ? "a" : "b", lang)`.
		const srcDir = fileURLToPath(new URL(".", import.meta.url));
		const sources = readdirSync(srcDir, { recursive: true })
			.filter((entry) => typeof entry === "string" && /\.tsx?$/.test(entry))
			.map((entry) => readFileSync(`${srcDir}${entry}`, "utf8"))
			.join("\n");

		// The `UIStringKey` union declares every key as a quoted literal, so
		// leaving it in the scan would make every key look "used" by its
		// own declaration. It is stripped before scanning — the union is
		// the definition site, not a use.
		const withoutKeyUnion = sources.replace(/export type UIStringKey\s*=[^;]*;/, "");

		const unused = Object.keys(STRINGS.en).filter(
			(key) => !new RegExp(`["']${key}["']`).test(withoutKeyUnion)
		);
		expect(unused).toEqual([]);
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

	it("uses three-letter English abbreviations", () => {
		expect(WEEKDAYS.en).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
	});
});
