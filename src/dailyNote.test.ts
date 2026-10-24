import { describe, expect, it } from "vitest";
import {
	formatDailyNotePath,
	formatDateBasename,
	formatDateFilename,
	isDatePathPrefix,
	isDailyNoteFileName,
	isInDailyNoteFolder,
	parseDateFromDailyNotePath,
	parseDateFromBasename,
} from "./dailyNote";

describe("parseDateFromBasename", () => {
	it("parses a valid YYYY-MM-DD basename", () => {
		expect(parseDateFromBasename("2026-07-13")).toEqual(new Date(2026, 6, 13));
	});

	it("parses the core Daily Notes plugin's slash-separated date format", () => {
		expect(parseDateFromBasename("2026/10/22", "YYYY/MM/DD")).toEqual(new Date(2026, 9, 22));
	});

	it("returns null for a basename that doesn't match the pattern at all", () => {
		expect(parseDateFromBasename("not-a-date")).toBeNull();
		expect(parseDateFromBasename("2026-7-13")).toBeNull(); // must be zero-padded
	});

	it("rejects a day that overflows its month instead of silently rolling over", () => {
		// 2026-02-31 would otherwise roll over to 2026-03-03 via the Date constructor.
		expect(parseDateFromBasename("2026-02-31")).toBeNull();
	});

	it("rejects an out-of-range month instead of silently rolling over into the next year", () => {
		expect(parseDateFromBasename("2026-13-01")).toBeNull();
	});

	it("accepts Feb 29 on a leap year but rejects it on a non-leap year", () => {
		expect(parseDateFromBasename("2024-02-29")).toEqual(new Date(2024, 1, 29));
		expect(parseDateFromBasename("2026-02-29")).toBeNull();
	});
});

describe("isDatePathPrefix", () => {
	it("recognizes folder names matching a prefix of a nested date format", () => {
		expect(isDatePathPrefix("2026", "YYYY/MM/DD")).toBe(true);
		expect(isDatePathPrefix("2026/10", "YYYY/MM/DD")).toBe(true);
	});

	it("rejects unrelated folders and complete date paths", () => {
		expect(isDatePathPrefix("Projects", "YYYY/MM/DD")).toBe(false);
		expect(isDatePathPrefix("2026/10/22", "YYYY/MM/DD")).toBe(false);
		expect(isDatePathPrefix("2026", "YYYY-MM-DD")).toBe(false);
	});
});

describe("formatDateBasename / formatDateFilename", () => {
	it("zero-pads month and day", () => {
		expect(formatDateBasename(new Date(2026, 0, 5))).toBe("2026-01-05");
		expect(formatDateFilename(new Date(2026, 0, 5))).toBe("2026-01-05.md");
	});

	it("round-trips through parseDateFromBasename", () => {
		const date = new Date(2026, 6, 13);
		expect(parseDateFromBasename(formatDateBasename(date))).toEqual(date);
	});

	it("formats using a custom core Daily Notes date format", () => {
		const date = new Date(2026, 9, 22);
		expect(formatDateBasename(date, "YYYY/MM/DD")).toBe("2026/10/22");
		expect(formatDateFilename(date, "YYYY/MM/DD")).toBe("2026/10/22.md");
	});
});

describe("Daily Notes plugin paths", () => {
	it("formats a note path under the core plugin folder", () => {
		expect(formatDailyNotePath(new Date(2026, 9, 22), "YYYY/MM/DD", "Log"))
			.toBe("Log/2026/10/22.md");
	});

	it("parses a nested daily note path relative to the core plugin folder", () => {
		expect(parseDateFromDailyNotePath("Log/2026/10/22.md", "YYYY/MM/DD", "Log"))
			.toEqual(new Date(2026, 9, 22));
	});

	it("does not identify paths outside the configured core folder", () => {
		expect(parseDateFromDailyNotePath("Other/2026/10/22.md", "YYYY/MM/DD", "Log")).toBeNull();
	});

	it("rejects invalid dates in a nested date path", () => {
		expect(parseDateFromDailyNotePath("Log/2026/02/31.md", "YYYY/MM/DD", "Log")).toBeNull();
	});
});

describe("isDailyNoteFileName", () => {
	it("accepts a date-named Markdown file", () => {
		expect(isDailyNoteFileName("2026-07-13.md")).toBe(true);
		expect(isDailyNoteFileName("2026-07-13.MD")).toBe(true);
		expect(isDailyNoteFileName("2026/10/22.md", "YYYY/MM/DD")).toBe(true);
	});

	it("rejects a date-named file with a non-Markdown extension", () => {
		// The plugin WRITES to the files it treats as daily notes, so a
		// date-named non-Markdown file (an image, a CSV export) must never
		// be picked up as a daily note and overwritten.
		expect(isDailyNoteFileName("2026-07-13.png")).toBe(false);
		expect(isDailyNoteFileName("2026-07-13.txt")).toBe(false);
		expect(isDailyNoteFileName("2026-07-13.canvas")).toBe(false);
	});

	it("rejects a file with no extension or a malformed date", () => {
		expect(isDailyNoteFileName("2026-07-13")).toBe(false);
		expect(isDailyNoteFileName("2026-7-13.md")).toBe(false);
		expect(isDailyNoteFileName("not-a-date.md")).toBe(false);
	});
});

describe("isInDailyNoteFolder", () => {	it("returns true for any path when folder setting is empty or whitespace", () => {
		expect(isInDailyNoteFolder("2026-07-13.md", "")).toBe(true);
		expect(isInDailyNoteFolder("Daily Notes/2026-07-13.md", "   ")).toBe(true);
	});

	it("returns true when file path is directly inside the configured folder", () => {
		expect(isInDailyNoteFolder("Daily Notes/2026-07-13.md", "Daily Notes")).toBe(true);
		expect(isInDailyNoteFolder("Daily Notes/2026-07-13.md", "Daily Notes/")).toBe(true);
	});

	it("returns true when file is inside a subfolder of the configured folder", () => {
		expect(isInDailyNoteFolder("journals/2026/07/2026-07-13.md", "journals")).toBe(true);
	});

	it("returns false when file is outside the configured folder", () => {
		expect(isInDailyNoteFolder("2026-07-13.md", "Daily Notes")).toBe(false);
		expect(isInDailyNoteFolder("Other Folder/2026-07-13.md", "Daily Notes")).toBe(false);
		expect(isInDailyNoteFolder("Daily Notes Extra/2026-07-13.md", "Daily Notes")).toBe(false);
	});
});
