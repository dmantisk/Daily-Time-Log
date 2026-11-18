import { describe, expect, it } from "vitest";
import {
	DEFAULT_CATEGORIES,
	DEFAULT_SETTINGS,
	calculateTimelineDuration,
	copyCategories,
	createDefaultCategories,
	findCategoryByDisplayName,
	isTimeInWindow,
	isValidMinutes,
	migrateLegacyHoursToMinutes,
	migrateLoadedSettings,
	resolveEventHeadingLevel,
	resolveEventHeadingText,
	resolveHour,
	resolveMinutes,
	timeToCellIndex,
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
		expect(DEFAULT_SETTINGS.dayStartMinutes).toBe(0);
		expect(DEFAULT_SETTINGS.dayEndMinutes).toBe(0); // 0 means midnight next day (full 24-hour timeline)
		expect(DEFAULT_SETTINGS.tabularTimeRanges).toBe(true);
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

describe("findCategoryByDisplayName", () => {
	const categories: CustomCategory[] = [
		{ name: "Work", displayName: "Work", color: "#d0e1fd" },
		{ name: "Deep-Work Focus", displayName: "Deep-Work Focus", color: "#ebd3f8" },
	];

	it("finds a category by its exact display name", () => {
		expect(findCategoryByDisplayName(categories, "Work")?.name).toBe("Work");
	});

	it("matches case-insensitively and ignores surrounding whitespace", () => {
		// The badge renderer, the sidebar and the dashboard must all
		// resolve a category token the same way — otherwise a `[work]`
		// token is drawn with the configured `Work` colour in the note but
		// counted as uncategorized in the dashboard.
		expect(findCategoryByDisplayName(categories, "work")?.name).toBe("Work");
		expect(findCategoryByDisplayName(categories, "WORK")?.name).toBe("Work");
		expect(findCategoryByDisplayName(categories, "  Work  ")?.name).toBe("Work");
	});

	it("returns undefined for an unknown, empty or missing name", () => {
		expect(findCategoryByDisplayName(categories, "Unknown")).toBeUndefined();
		expect(findCategoryByDisplayName(categories, "")).toBeUndefined();
		expect(findCategoryByDisplayName(categories, "   ")).toBeUndefined();
		expect(findCategoryByDisplayName(categories, undefined)).toBeUndefined();
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

describe("resolveHour", () => {
	it("keeps a valid integer hour 0-24", () => {
		expect(resolveHour(0, 0)).toBe(0);
		expect(resolveHour(12, 0)).toBe(12);
		expect(resolveHour(24, 24)).toBe(24);
	});

	it("falls back to default for out-of-range or non-integer values", () => {
		expect(resolveHour(-1, 0)).toBe(0);
		expect(resolveHour(25, 24)).toBe(24);
		expect(resolveHour(2.5, 0)).toBe(0);
		expect(resolveHour("9", 0)).toBe(0);
		expect(resolveHour(undefined, 0)).toBe(0);
	});
});

describe("validateCategoryName", () => {
	const categories: CustomCategory[] = [
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

describe("isValidMinutes", () => {
	it("accepts valid minute values (0-1430, multiples of 10)", () => {
		expect(isValidMinutes(0)).toBe(true);
		expect(isValidMinutes(10)).toBe(true);
		expect(isValidMinutes(540)).toBe(true); // 09:00
		expect(isValidMinutes(1430)).toBe(true); // 23:50
	});

	it("rejects invalid minute values", () => {
		expect(isValidMinutes(-1)).toBe(false);
		expect(isValidMinutes(1431)).toBe(false);
		expect(isValidMinutes(1440)).toBe(false);
		expect(isValidMinutes(5)).toBe(false); // Not multiple of 10
		expect(isValidMinutes(545)).toBe(false); // Not multiple of 10
		expect(isValidMinutes(2.5)).toBe(false); // Not integer
		expect(isValidMinutes("540")).toBe(false); // Not number
		expect(isValidMinutes(undefined)).toBe(false);
	});
});

describe("resolveMinutes", () => {
	it("keeps a valid minute value", () => {
		expect(resolveMinutes(0, 0)).toBe(0);
		expect(resolveMinutes(540, 0)).toBe(540);
		expect(resolveMinutes(1430, 1440)).toBe(1430);
	});

	it("falls back to default for invalid values", () => {
		expect(resolveMinutes(-1, 0)).toBe(0);
		expect(resolveMinutes(1440, 1440)).toBe(1440);
		expect(resolveMinutes(5, 0)).toBe(0);
		expect(resolveMinutes(2.5, 0)).toBe(0);
		expect(resolveMinutes("540", 0)).toBe(0);
		expect(resolveMinutes(undefined, 0)).toBe(0);
	});
});

describe("calculateTimelineDuration", () => {
	it("calculates duration for same-day ranges", () => {
		expect(calculateTimelineDuration(8 * 60, 14 * 60)).toBe(360); // 08:00 to 14:00 = 6 hours
		expect(calculateTimelineDuration(0, 1440)).toBe(1440); // Full day (but end=1440 is not valid input)
	});

	it("calculates duration for overnight ranges", () => {
		expect(calculateTimelineDuration(8 * 60, 2 * 60)).toBe(1080); // 08:00 to 02:00 = 18 hours
		expect(calculateTimelineDuration(12 * 60, 6 * 60)).toBe(1080); // 12:00 to 06:00 = 18 hours
		expect(calculateTimelineDuration(23 * 60 + 50, 0)).toBe(10); // 23:50 to 00:00 = 10 minutes
	});

	it("calculates 24-hour duration for equal start and end", () => {
		expect(calculateTimelineDuration(0, 0)).toBe(1440);
		expect(calculateTimelineDuration(4 * 60, 4 * 60)).toBe(1440);
		expect(calculateTimelineDuration(8 * 60, 8 * 60)).toBe(1440);
	});
});

describe("isTimeInWindow", () => {
	it("checks time in same-day window", () => {
		const start = 8 * 60;
		const end = 14 * 60;
		expect(isTimeInWindow(8 * 60, start, end)).toBe(true);
		expect(isTimeInWindow(10 * 60, start, end)).toBe(true);
		expect(isTimeInWindow(13 * 60 + 50, start, end)).toBe(true);
		expect(isTimeInWindow(14 * 60, start, end)).toBe(false); // Exclusive end
		expect(isTimeInWindow(7 * 60, start, end)).toBe(false);
	});

	it("checks time in overnight window", () => {
		const start = 8 * 60;
		const end = 2 * 60;
		expect(isTimeInWindow(8 * 60, start, end)).toBe(true);
		expect(isTimeInWindow(14 * 60, start, end)).toBe(true);
		expect(isTimeInWindow(23 * 60, start, end)).toBe(true);
		expect(isTimeInWindow(0, start, end)).toBe(true);
		expect(isTimeInWindow(1 * 60, start, end)).toBe(true);
		expect(isTimeInWindow(2 * 60, start, end)).toBe(false); // Exclusive end
		expect(isTimeInWindow(7 * 60, start, end)).toBe(false);
	});

	it("returns true for all times in 24-hour window", () => {
		expect(isTimeInWindow(0, 0, 0)).toBe(true);
		expect(isTimeInWindow(12 * 60, 0, 0)).toBe(true);
		expect(isTimeInWindow(23 * 60 + 50, 0, 0)).toBe(true);
	});
});

describe("timeToCellIndex", () => {
	it("converts time to cell index for same-day window", () => {
		const start = 8 * 60;
		const end = 14 * 60;
		expect(timeToCellIndex(8 * 60, start, end)).toBe(0);
		expect(timeToCellIndex(9 * 60, start, end)).toBe(6);
		expect(timeToCellIndex(13 * 60 + 50, start, end)).toBe(35);
		expect(timeToCellIndex(14 * 60, start, end)).toBe(-1); // Exclusive end
		expect(timeToCellIndex(7 * 60, start, end)).toBe(-1);
	});

	it("converts time to cell index for overnight window", () => {
		const start = 8 * 60;
		const end = 2 * 60;
		expect(timeToCellIndex(8 * 60, start, end)).toBe(0);
		expect(timeToCellIndex(14 * 60, start, end)).toBe(36);
		expect(timeToCellIndex(23 * 60 + 50, start, end)).toBe(95);
		expect(timeToCellIndex(0, start, end)).toBe(96);
		expect(timeToCellIndex(1 * 60 + 50, start, end)).toBe(107);
		expect(timeToCellIndex(2 * 60, start, end)).toBe(-1); // Exclusive end
		expect(timeToCellIndex(7 * 60, start, end)).toBe(-1);
	});

	it("converts time to cell index for 24-hour window", () => {
		expect(timeToCellIndex(0, 0, 0)).toBe(0);
		expect(timeToCellIndex(12 * 60, 0, 0)).toBe(72);
		expect(timeToCellIndex(23 * 60 + 50, 0, 0)).toBe(143);
	});
});

describe("migrateLegacyHoursToMinutes", () => {
	it("migrates default legacy settings (0-24) to full 24-hour timeline", () => {
		const result = migrateLegacyHoursToMinutes(0, 24);
		expect(result.dayStartMinutes).toBe(0);
		expect(result.dayEndMinutes).toBe(0); // 24 -> 0 (midnight next day)
	});

	it("migrates same-day legacy settings", () => {
		const result = migrateLegacyHoursToMinutes(8, 14);
		expect(result.dayStartMinutes).toBe(480); // 08:00
		expect(result.dayEndMinutes).toBe(840); // 14:00
	});

	it("migrates overnight legacy settings", () => {
		const result = migrateLegacyHoursToMinutes(8, 2);
		expect(result.dayStartMinutes).toBe(480); // 08:00
		expect(result.dayEndMinutes).toBe(120); // 02:00
	});

	it("handles missing legacy values with defaults", () => {
		const result = migrateLegacyHoursToMinutes(undefined, undefined);
		expect(result.dayStartMinutes).toBe(0);
		expect(result.dayEndMinutes).toBe(0); // Default endHour was 24 -> 0
	});

	it("handles partial legacy values", () => {
		const result = migrateLegacyHoursToMinutes(8, undefined);
		expect(result.dayStartMinutes).toBe(480);
		expect(result.dayEndMinutes).toBe(0); // Default endHour was 24 -> 0
	});
});

describe("migrateLoadedSettings", () => {
	it("null input (fresh install) returns defaults with shouldSave=true (tabularTimeRanges defaulted)", () => {
		const { settings, shouldSave } = migrateLoadedSettings(null);
		expect(settings).toEqual(DEFAULT_SETTINGS);
		expect(shouldSave).toBe(true); // tabularTimeRanges not provided -> defaulted -> shouldSave
	});

	it("legacy dailyNoteFolder key triggers shouldSave", () => {
		const loaded = { dailyNoteFolder: "some/path", language: "en" };
		const { settings, shouldSave } = migrateLoadedSettings(loaded);
		expect(settings.language).toBe("en");
		expect(shouldSave).toBe(true);
	});

	it("unknown keys are dropped", () => {
		const loaded = { unknownKey: "value", language: "ko", anotherUnknown: 123 };
		const { settings, shouldSave } = migrateLoadedSettings(loaded);
		expect(settings.language).toBe("ko");
		expect("unknownKey" in settings).toBe(false);
		expect("anotherUnknown" in settings).toBe(false);
		expect(shouldSave).toBe(true); // tabularTimeRanges not provided -> defaulted -> shouldSave
	});

	it("categories deep-copied (mutating the result does not change DEFAULT_SETTINGS)", () => {
		const loaded = { categories: [{ name: "Custom", displayName: "Custom", color: "#ff0000" }] };
		const { settings } = migrateLoadedSettings(loaded);
		// Mutate the returned categories
		settings.categories[0].displayName = "Mutated";
		settings.categories[0].color = "#00ff00";
		// DEFAULT_SETTINGS should be unchanged
		expect(DEFAULT_SETTINGS.categories[0].displayName).toBe("Work");
		expect(DEFAULT_SETTINGS.categories[0].color).toBe("#d0e1fd");
		// A fresh call should also get unmutated defaults
		const { settings: fresh } = migrateLoadedSettings(null);
		expect(fresh.categories[0].displayName).toBe("Work");
		expect(fresh.categories[0].color).toBe("#d0e1fd");
	});

	it("invalid eventHeadingText and eventHeadingLevel are corrected", () => {
		const loaded = {
			eventHeadingText: "", // empty -> default
			eventHeadingLevel: 7, // out of range -> default
		};
		const { settings, shouldSave } = migrateLoadedSettings(loaded);
		expect(settings.eventHeadingText).toBe(DEFAULT_SETTINGS.eventHeadingText);
		expect(settings.eventHeadingLevel).toBe(DEFAULT_SETTINGS.eventHeadingLevel);
		expect(shouldSave).toBe(true);
	});

	it("legacy startHour/endHour become minutes", () => {
		const loaded = { startHour: 8, endHour: 14 };
		const { settings, shouldSave } = migrateLoadedSettings(loaded);
		expect(settings.dayStartMinutes).toBe(480); // 8 * 60
		expect(settings.dayEndMinutes).toBe(840); // 14 * 60
		expect(shouldSave).toBe(true);
	});

	it("valid new-format minutes win over legacy hours", () => {
		const loaded = {
			dayStartMinutes: 540, // 09:00
			dayEndMinutes: 1020, // 17:00
			startHour: 8, // legacy 08:00
			endHour: 14, // legacy 14:00
		};
		const { settings, shouldSave } = migrateLoadedSettings(loaded);
		expect(settings.dayStartMinutes).toBe(540); // new format wins
		expect(settings.dayEndMinutes).toBe(1020); // new format wins
		expect(shouldSave).toBe(true); // tabularTimeRanges not provided -> defaulted -> shouldSave
	});

	it("non-boolean tabularTimeRanges is defaulted", () => {
		const loaded = { tabularTimeRanges: "true" }; // string instead of boolean
		const { settings, shouldSave } = migrateLoadedSettings(loaded);
		expect(settings.tabularTimeRanges).toBe(DEFAULT_SETTINGS.tabularTimeRanges);
		expect(shouldSave).toBe(true);
	});
});
