import { describe, expect, it } from "vitest";
import { computeDashboardStats, getRecentWindowStart, isWithinRecentWindow } from "./dashboardCollector";
import type { ParsedDailyNote } from "./parser";

const EMPTY_NOTE: ParsedDailyNote = { timeline: [] };

describe("getRecentWindowStart", () => {
	it("returns the day exactly 29 days before today (30-day window, inclusive)", () => {
		const today = new Date(2026, 6, 30); // 2026-07-30
		const start = getRecentWindowStart(today);
		expect(start).toEqual(new Date(2026, 6, 1)); // 2026-07-01
	});
});

describe("isWithinRecentWindow", () => {
	const today = new Date(2026, 6, 30); // 2026-07-30

	it("includes a note dated today", () => {
		expect(isWithinRecentWindow(new Date(2026, 6, 30), today)).toBe(true);
	});

	it("includes a note inside the window", () => {
		expect(isWithinRecentWindow(new Date(2026, 6, 1), today)).toBe(true);
	});

	it("excludes a note before the window", () => {
		expect(isWithinRecentWindow(new Date(2026, 5, 30), today)).toBe(false);
	});

	it("excludes a note dated in the future", () => {
		// A future-dated daily note records no elapsed time, so counting it
		// would inflate the period totals and put a not-yet-happened day
		// at the top of the recent-activity list.
		expect(isWithinRecentWindow(new Date(2026, 6, 31), today)).toBe(false);
		expect(isWithinRecentWindow(new Date(2026, 7, 15), today)).toBe(false);
	});

	it("excludes future notes even in the all-time window", () => {
		expect(isWithinRecentWindow(new Date(2026, 6, 31), today, 0)).toBe(false);
		expect(isWithinRecentWindow(new Date(2020, 0, 1), today, 0)).toBe(true);
	});

	it("honours a shorter window", () => {
		expect(isWithinRecentWindow(new Date(2026, 6, 20), today, 7)).toBe(false);
		expect(isWithinRecentWindow(new Date(2026, 6, 24), today, 7)).toBe(true);
	});
});

describe("computeDashboardStats — daily average denominator", () => {
	const today = new Date(2026, 6, 14); // 2026-07-14

	const oneHour = (date: Date): { date: Date; parsed: ParsedDailyNote } => ({
		date,
		parsed: {
			timeline: [{ line: 0, lineCount: 1, start: "09:00", end: "10:00", category: "Work", description: "a" }],
		} satisfies ParsedDailyNote,
	});

	it("divides by the days that recorded time, not by the number of notes", () => {
		// Ten notes of 60 minutes each → 600 minutes over 10 recording days
		// → 60 minutes per day. The old code divided by the note count,
		// which happened to agree here, so the real defect shows below.
		const dates = Array.from({ length: 10 }, (_, i) => new Date(2026, 6, i + 1));
		const stats = computeDashboardStats(dates, dates.map(oneHour), today, undefined, "Uncategorized");
		expect(stats.recentEventMinutes).toBe(600);
		expect(stats.avgEventMinutesPerDay).toBe(60);
	});

	it("excludes a note that recorded no time from the denominator", () => {
		// A note that exists but recorded nothing is a day that recorded
		// nothing, not a day that recorded a zero — it must not drag the
		// average down. Old code: 120 / 2 notes = 60 (wrong).
		const dates = [new Date(2026, 6, 13), new Date(2026, 6, 14)];
		const stats = computeDashboardStats(
			dates,
			[oneHour(dates[0]), { date: dates[1], parsed: EMPTY_NOTE }],
			today,
			undefined,
			"Uncategorized"
		);
		expect(stats.recentEventMinutes).toBe(60);
		expect(stats.avgEventMinutesPerDay).toBe(60);
	});

	it("reports 0 when nothing in the window recorded time", () => {
		const stats = computeDashboardStats([today], [{ date: today, parsed: EMPTY_NOTE }], today);
		expect(stats.recentEventMinutes).toBe(0);
		expect(stats.avgEventMinutesPerDay).toBe(0);
	});

	it("counts two files carrying the same date as one day", () => {
		// A daily note IS a day, and the same date can appear twice in a
		// scanned folder (`2026-07-14.md` and `archive/2026-07-14.md`).
		// Those are one day, so the average must not be halved.
		const day = new Date(2026, 6, 14);
		const stats = computeDashboardStats(
			[day, day],
			[oneHour(day), oneHour(day)],
			today,
			undefined,
			"Uncategorized"
		);
		expect(stats.recentEventMinutes).toBe(120);
		expect(stats.avgEventMinutesPerDay).toBe(120);
	});
});

describe("computeDashboardStats", () => {
	it("returns all zeros/nulls for an empty vault", () => {
		const stats = computeDashboardStats([], [], new Date(2026, 6, 14));
		expect(stats.totalNotes).toBe(0);
		expect(stats.oldestDate).toBeNull();
		expect(stats.newestDate).toBeNull();
		expect(stats.currentStreak).toBe(0);
		expect(stats.recentEventMinutes).toBe(0);
		expect(stats.avgEventMinutesPerDay).toBe(0);
		expect(stats.topCategoryName).toBeNull();
		expect(stats.categoryBreakdown).toEqual([]);
		expect(stats.recentNotesSummary).toEqual([]);
	});

	it("computes total count and oldest/newest regardless of input order", () => {
		const dates = [new Date(2026, 6, 10), new Date(2026, 5, 1), new Date(2026, 6, 14)];
		const stats = computeDashboardStats(dates, [], new Date(2026, 6, 14));
		expect(stats.totalNotes).toBe(3);
		expect(stats.oldestDate).toEqual(new Date(2026, 5, 1));
		expect(stats.newestDate).toEqual(new Date(2026, 6, 14));
	});

	it("counts a consecutive streak ending today", () => {
		const today = new Date(2026, 6, 14);
		const dates = [new Date(2026, 6, 12), new Date(2026, 6, 13), new Date(2026, 6, 14)];
		expect(computeDashboardStats(dates, [], today).currentStreak).toBe(3);
	});

	it("stops the streak at the first gap", () => {
		const today = new Date(2026, 6, 14);
		const dates = [new Date(2026, 6, 10), new Date(2026, 6, 13), new Date(2026, 6, 14)]; // gap at 11/12
		expect(computeDashboardStats(dates, [], today).currentStreak).toBe(2);
	});

	it("streak is 0 if today itself has no note", () => {
		const today = new Date(2026, 6, 14);
		const dates = [new Date(2026, 6, 12), new Date(2026, 6, 13)];
		expect(computeDashboardStats(dates, [], today).currentStreak).toBe(0);
	});

	it("aggregates category breakdown and daily average", () => {
		const today = new Date(2026, 6, 14);
		const dates = [new Date(2026, 6, 14)];
		const recentParsed = [
			{
				date: new Date(2026, 6, 14),
				parsed: {
					timeline: [
						{ line: 0, lineCount: 1, start: "09:00", end: "10:30", category: "Work", description: "work task" },
						{ line: 1, lineCount: 1, start: "11:00", end: "12:00", category: "Study", description: "study task" },
					],
				} satisfies ParsedDailyNote,
			},
		];

		const customCategories = [
			{ name: "Work", displayName: "Work", color: "#d0e1fd" },
			{ name: "Study", displayName: "Study", color: "#ebd3f8" },
		];

		const stats = computeDashboardStats(dates, recentParsed, today, customCategories);
		expect(stats.recentEventMinutes).toBe(150); // 90m + 60m
		expect(stats.avgEventMinutesPerDay).toBe(150);
		expect(stats.topCategoryName).toBe("Work");
		expect(stats.categoryBreakdown).toHaveLength(2);
		expect(stats.categoryBreakdown[0]).toEqual({
			displayName: "Work",
			color: "#d0e1fd",
			minutes: 90,
			percentage: 60,
		});
		expect(stats.categoryBreakdown[1]).toEqual({
			displayName: "Study",
			color: "#ebd3f8",
			minutes: 60,
			percentage: 40,
		});

		expect(stats.recentNotesSummary).toHaveLength(1);
		expect(stats.recentNotesSummary[0].topCategory).toBe("Work");
	});

	it("folds a category no longer present in settings into uncategorized, rather than dropping its minutes", () => {
		// A timeline line's [Category] token is stored verbatim (settings.ts
		// CustomCategory doc): if the category was later renamed or deleted, the
		// old text stops matching any configured category and must render as
		// uncategorized — its minutes must still be accounted for somewhere in
		// categoryBreakdown, not silently excluded.
		const today = new Date(2026, 6, 14);
		const dates = [today];
		const recentParsed = [
			{
				date: today,
				parsed: {
					timeline: [
						{ line: 0, lineCount: 1, start: "09:00", end: "10:00", category: "Work", description: "a" },
						{ line: 1, lineCount: 1, start: "10:00", end: "11:00", category: "OldRenamedCategory", description: "b" },
					],
				} satisfies ParsedDailyNote,
			},
		];
		const customCategories = [{ name: "Work", displayName: "Work", color: "#d0e1fd" }];

		const stats = computeDashboardStats(dates, recentParsed, today, customCategories, "Uncategorized");
		expect(stats.recentEventMinutes).toBe(120);
		const totalBreakdownMinutes = stats.categoryBreakdown.reduce((sum, item) => sum + item.minutes, 0);
		expect(totalBreakdownMinutes).toBe(stats.recentEventMinutes);
		const uncategorized = stats.categoryBreakdown.find((item) => item.displayName === "Uncategorized");
		expect(uncategorized?.minutes).toBe(60);
		expect(uncategorized?.color).toBe("var(--text-faint)");
	});

	it("matches category names case-insensitively, same as the badge renderer", () => {
		// The badge renderer resolved a token case-insensitively while the
		// timeline and the dashboard used an exact match, so a `[work]`
		// token was drawn with the configured `Work` colour in the note but
		// counted as uncategorized in the dashboard. All three now share
		// one rule.
		const today = new Date(2026, 6, 14);
		const dates = [today];
		const recentParsed = [
			{
				date: today,
				parsed: {
					timeline: [{ line: 0, lineCount: 1, start: "09:00", end: "10:00", category: "work", description: "a" }],
				} satisfies ParsedDailyNote,
			},
		];
		const customCategories = [{ name: "Work", displayName: "Work", color: "#d0e1fd" }];

		const stats = computeDashboardStats(dates, recentParsed, today, customCategories, "Uncategorized");
		expect(stats.categoryBreakdown).toEqual([
			{ displayName: "Work", color: "#d0e1fd", minutes: 60, percentage: 100 },
		]);
	});

	it("counts a duplicate category name only once, so the totals are not doubled", () => {
		// The settings screen refuses to create two categories with the same
		// display name, but a settings file written by an older version could
		// still contain one. The breakdown is keyed by display name, so both
		// would otherwise be credited with the same minutes.
		const today = new Date(2026, 6, 14);
		const recentParsed = [
			{
				date: today,
				parsed: {
					timeline: [{ line: 0, lineCount: 1, start: "09:00", end: "10:00", category: "Work", description: "a" }],
				} satisfies ParsedDailyNote,
			},
		];
		const duplicateCategories = [
			{ name: "Work", displayName: "Work", color: "#d0e1fd" },
			{ name: "Work", displayName: "Work", color: "#ff0000" },
		];

		const stats = computeDashboardStats([today], recentParsed, today, duplicateCategories, "Uncategorized");
		expect(stats.categoryBreakdown).toHaveLength(1);
		expect(stats.categoryBreakdown[0].minutes).toBe(60);
		expect(stats.categoryBreakdown[0].percentage).toBe(100);
	});

	it("ignores empty parsed notes without error", () => {
		const today = new Date(2026, 6, 14);
		const stats = computeDashboardStats(
			[today],
			[{ date: today, parsed: EMPTY_NOTE }],
			today
		);
		expect(stats.recentEventMinutes).toBe(0);
	});
});
