import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type DailyWorkLogSettings } from "./settings";

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
