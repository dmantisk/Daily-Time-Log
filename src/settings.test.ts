import { describe, expect, it } from "vitest";
import {
	DEFAULT_CATEGORIES,
	DEFAULT_SETTINGS,
	copyCategories,
	createDefaultCategories,
	resolveEventHeadingLevel,
	resolveEventHeadingText,
	validateCategoryName,
	type CustomCategory,
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

describe("category copies", () => {
	it("copies the default categories deeply, so edits cannot reach the defaults", () => {
		// The settings screen mutates category objects in place. A shallow
		// copy would leave the copy sharing the objects in
		// DEFAULT_CATEGORIES, so renaming a category after a reset would
		// permanently alter the defaults.
		const copy = createDefaultCategories();
		expect(copy).toEqual(DEFAULT_CATEGORIES);

		copy[0].displayName = "Renamed";
		copy[0].color = "#000000";

		expect(DEFAULT_CATEGORIES[0].displayName).toBe("Work");
		expect(DEFAULT_CATEGORIES[0].color).toBe("#d0e1fd");
		expect(createDefaultCategories()[0].displayName).toBe("Work");
	});

	it("copies an arbitrary category list deeply", () => {
		const source: CustomCategory[] = [{ name: "Work", displayName: "Work", color: "#d0e1fd" }];
		const copy = copyCategories(source);

		copy[0].displayName = "Renamed";
		expect(source[0].displayName).toBe("Work");
	});

	it("does not let the default settings share the default category objects", () => {
		const original = DEFAULT_SETTINGS.categories[0].displayName;
		try {
			DEFAULT_SETTINGS.categories[0].displayName = "Renamed";
			expect(DEFAULT_CATEGORIES[0].displayName).toBe("Work");
		} finally {
			DEFAULT_SETTINGS.categories[0].displayName = original;
		}
	});
});

describe("validateCategoryName", () => {	const categories: CustomCategory[] = [
		{ name: "Work", displayName: "Work", color: "#d0e1fd" },
		{ name: "Study", displayName: "Study", color: "#ebd3f8" },
	];

	it("accepts a fresh, non-empty name", () => {
		expect(validateCategoryName(categories, "Reading")).toBeNull();
	});

	it("rejects a blank name", () => {
		// A blank name cannot be written into a note as `[Name]`, and the
		// dashboard keys its totals by display name.
		expect(validateCategoryName(categories, "")).toBe("empty");
		expect(validateCategoryName(categories, "   ")).toBe("empty");
	});

	it("rejects a name already used by another category", () => {
		// Two categories sharing a display name would each be credited
		// with the same minutes, doubling the dashboard totals.
		expect(validateCategoryName(categories, "Work")).toBe("duplicate");
		expect(validateCategoryName(categories, "work")).toBe("duplicate");
		expect(validateCategoryName(categories, "  WORK  ")).toBe("duplicate");
	});

	it("allows a category to keep its own name", () => {
		// The category being edited must not count as a duplicate of
		// itself, or renaming a category to the name it already has would
		// be rejected.
		expect(validateCategoryName(categories, "Work", 0)).toBeNull();
		expect(validateCategoryName(categories, "Study", 0)).toBe("duplicate");
	});
});
