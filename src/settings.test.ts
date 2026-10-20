import { describe, expect, it } from "vitest";
import {
	DEFAULT_SETTINGS,
	resolveEventHeadingLevel,
	resolveEventHeadingText,
	type DailyWorkLogSettings,
} from "./settings";
import { DEFAULT_EVENT_HEADING } from "./parser";

describe("settings defaults", () => {
	it("defaults the language preference to auto", () => {
		expect(DEFAULT_SETTINGS.language).toBe("auto");
	});

	it("provides the default categories and timeline range", () => {
		expect(DEFAULT_SETTINGS.categories).toHaveLength(5);
		expect(DEFAULT_SETTINGS.startHour).toBe(0);
		expect(DEFAULT_SETTINGS.endHour).toBe(24);
	});

	it("fills missing fields while preserving saved overrides", () => {
		const loaded: Partial<DailyWorkLogSettings> = { language: "ko" };
		const merged = Object.assign({}, DEFAULT_SETTINGS, loaded);
		expect(merged.language).toBe("ko");
		expect(merged.categories).toEqual(DEFAULT_SETTINGS.categories);
	});

	it("preserves an intentionally empty categories list", () => {
		const loaded: Partial<DailyWorkLogSettings> = { categories: [] };
		const merged = Object.assign({}, DEFAULT_SETTINGS, loaded);
		expect(merged.categories).toEqual([]);
	});
});

describe("resolveEventHeadingText", () => {
	it("keeps a valid configured heading", () => {
		expect(resolveEventHeadingText("Activity")).toBe("Activity");
		expect(resolveEventHeadingText("  Activity  ")).toBe("Activity");
	});

	it("falls back to the default for a missing, empty or multi-line value", () => {
		expect(resolveEventHeadingText(undefined)).toBe(DEFAULT_SETTINGS.eventHeadingText);
		expect(resolveEventHeadingText(null)).toBe(DEFAULT_SETTINGS.eventHeadingText);
		expect(resolveEventHeadingText(42)).toBe(DEFAULT_SETTINGS.eventHeadingText);
		expect(resolveEventHeadingText("")).toBe(DEFAULT_SETTINGS.eventHeadingText);
		expect(resolveEventHeadingText("   ")).toBe(DEFAULT_SETTINGS.eventHeadingText);
		expect(resolveEventHeadingText("Event\nOther")).toBe(DEFAULT_SETTINGS.eventHeadingText);
	});

	it("defaults to the parser's heading, not a localized variant", () => {
		// The Event heading is part of the note FORMAT, so it must not
		// depend on the interface language. A Korean user who never
		// touched the setting gets exactly the same heading as everyone
		// else, and the settings UI shows what the parser looks for.
		expect(DEFAULT_SETTINGS.eventHeadingText).toBe(DEFAULT_EVENT_HEADING.text);
		expect(DEFAULT_SETTINGS.eventHeadingLevel).toBe(DEFAULT_EVENT_HEADING.level);
		expect(resolveEventHeadingText(undefined)).toBe("Event");
	});
});

describe("resolveEventHeadingLevel", () => {
	it("keeps a valid level", () => {
		expect(resolveEventHeadingLevel(1)).toBe(1);
		expect(resolveEventHeadingLevel(6)).toBe(6);
	});

	it("falls back to the default for an out-of-range or non-integer value", () => {
		expect(resolveEventHeadingLevel(0)).toBe(DEFAULT_SETTINGS.eventHeadingLevel);
		expect(resolveEventHeadingLevel(7)).toBe(DEFAULT_SETTINGS.eventHeadingLevel);
		expect(resolveEventHeadingLevel(2.5)).toBe(DEFAULT_SETTINGS.eventHeadingLevel);
		expect(resolveEventHeadingLevel(undefined)).toBe(DEFAULT_SETTINGS.eventHeadingLevel);
		expect(resolveEventHeadingLevel("2")).toBe(DEFAULT_SETTINGS.eventHeadingLevel);
	});
});
