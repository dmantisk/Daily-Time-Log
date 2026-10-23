/**
 * Pure statistics computation for the Dashboard view.
 * ZERO Obsidian API dependency — same "decoupled parser strategy" as
 * parser.ts/dailyNote.ts (AGENTS.md 4), so this stays unit-testable in
 * plain Node/Vitest. The Obsidian-dependent side (scanning the vault,
 * reading file contents) lives in DashboardView.ts, which calls into this
 * module with already-extracted data.
 */

import { formatDateBasename } from "./dailyNote";
import { timelineDurationMinutes, type ParsedDailyNote } from "./parser";
import { DEFAULT_CATEGORIES, findCategoryByDisplayName, type CustomCategory } from "./settings";

/** How far back recent Event-time statistics look. */
export const RECENT_WINDOW_DAYS = 30;

export interface CategoryStatItem {
	displayName: string;
	color: string;
	minutes: number;
	percentage: number;
}

export interface NoteActivitySummary {
	date: Date;
	path: string;
	eventMinutes: number;
	topCategory: string | null;
}

export interface DashboardStats {
	/** Daily notes dated on or before `today` — future-dated notes are NOT counted. */
	totalNotes: number;
	oldestDate: Date | null;
	newestDate: Date | null;
	/** Consecutive days with a note, counting backward from `today` (0 if today has none). */
	currentStreak: number;
	recentEventMinutes: number;
	/**
	 * Average recorded minutes per day that recorded time — the window's
	 * total divided by the number of distinct dates whose note recorded at
	 * least one minute.
	 *
	 * A daily note IS a day (`YYYY-MM-DD.md`, one per date), so the
	 * denominator is a count of days. Days whose note exists but recorded
	 * no time are excluded: they are days that recorded nothing, not days
	 * that recorded a zero.
	 */
	avgEventMinutesPerDay: number;
	topCategoryName: string | null;
	categoryBreakdown: CategoryStatItem[];
	recentNotesSummary: NoteActivitySummary[];
}

/**
 * First calendar day of the "recent" window (inclusive), for a given
 * `today` and `windowDays` (defaults to RECENT_WINDOW_DAYS).
 */
export function getRecentWindowStart(today: Date, windowDays: number = RECENT_WINDOW_DAYS): Date {
	const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
	if (windowDays > 0) {
		start.setDate(start.getDate() - (windowDays - 1));
	} else {
		// All time: set start date far in the past (e.g. 1970-01-01)
		start.setFullYear(1970, 0, 1);
	}
	return start;
}

/**
 * True when a note's date is on or before `today` (i.e. the day has
 * already happened).
 *
 * A daily note can legitimately be dated in the future — a template
 * pre-created for tomorrow, a template with a fixed date, a note copied
 * from another vault. Such a note records no elapsed time, so it is
 * excluded from every figure that describes what was actually recorded.
 *
 * This is the ONE shared rule for the future bound; both
 * `isWithinRecentWindow` and the vault-wide counts use it, so the
 * period totals and the vault-wide figures can never disagree about
 * which notes count.
 */
export function isOnOrBeforeToday(noteDate: Date, today: Date): boolean {
	const noteDay = new Date(noteDate.getFullYear(), noteDate.getMonth(), noteDate.getDate());
	const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
	return noteDay.getTime() <= todayDay.getTime();
}

/**
 * True when a note's date falls inside the selected window.
 *
 * The window is bounded on BOTH ends: notes dated after `today` are
 * excluded. A daily note can legitimately be dated in the future (a
 * template pre-created for tomorrow, a template with a fixed date, a
 * note copied from another vault), but such a note records no elapsed
 * time — counting it would inflate the period totals and put a
 * not-yet-happened day at the top of the recent-activity list.
 *
 * For the "All Time" window (`windowDays <= 0`) the start bound is
 * dropped but the future bound still applies.
 */
export function isWithinRecentWindow(noteDate: Date, today: Date, windowDays: number = RECENT_WINDOW_DAYS): boolean {
	if (!isOnOrBeforeToday(noteDate, today)) return false;

	const noteDay = new Date(noteDate.getFullYear(), noteDate.getMonth(), noteDate.getDate());
	return noteDay.getTime() >= getRecentWindowStart(today, windowDays).getTime();
}

/**
 * @param allNoteDates every daily note's date, filename-derived only (cheap — no file reads needed).
 * @param recentParsed notes within the selected window, with content already read+parsed.
 * @param today "now", passed in explicitly so this stays a pure, testable function.
 * @param categories configured categories for color/label matching.
 * @param uncategorizedLabel localized label for uncategorized items.
 */
export function computeDashboardStats(
	allNoteDates: Date[],
	recentParsed: Array<{ date: Date; path: string; parsed: ParsedDailyNote }>,
	today: Date,
	categories: CustomCategory[] = DEFAULT_CATEGORIES,
	uncategorizedLabel = "Uncategorized"
): DashboardStats {
	// The vault-wide figures describe what was actually recorded, so they
	// apply the SAME future bound as the period totals. Without this, the
	// dashboard could report "Total Notes: 2" with a date range ending
	// 2026-07-31 while its own time figures ignored that note entirely.
	// (A daily note is named for one date, so a future-dated note is a
	// day that has not happened yet.)
	const countedNoteDates = allNoteDates.filter((date) => isOnOrBeforeToday(date, today));

	if (countedNoteDates.length === 0) {
		return {
			totalNotes: 0,
			oldestDate: null,
			newestDate: null,
			currentStreak: 0,
			recentEventMinutes: 0,
			avgEventMinutesPerDay: 0,
			topCategoryName: null,
			categoryBreakdown: [],
			recentNotesSummary: [],
		};
	}

	const sorted = [...countedNoteDates].sort((a, b) => a.getTime() - b.getTime());
	const oldestDate = sorted[0];
	const newestDate = sorted[sorted.length - 1];

	const noteDateStrings = new Set(countedNoteDates.map((date) => formatDateBasename(date)));
	let currentStreak = 0;
	const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
	// Count from yesterday when today's note does not exist.
	if (!noteDateStrings.has(formatDateBasename(cursor))) {
		cursor.setDate(cursor.getDate() - 1);
	}
	while (noteDateStrings.has(formatDateBasename(cursor))) {
		currentStreak++;
		cursor.setDate(cursor.getDate() - 1);
	}

	let recentEventMinutes = 0;
	// The dates of the window notes that recorded at least one minute — the
	// denominator of the daily average. A note that exists but recorded no
	// time is a day that recorded nothing, not a day that recorded a zero,
	// so it must not drag the average down.
	//
	// Keyed by DATE, not by note: a daily note IS a day, and the same date
	// can appear twice in a scanned folder (e.g. `2026-07-14.md` and
	// `archive/2026-07-14.md`) — those two files are ONE day, and counting
	// them twice would halve the reported average.
	const daysWithRecordedTime = new Set<string>();

	// Map of category displayName -> total minutes
	const categoryMinutesMap = new Map<string, number>();
	for (const cat of categories) {
		categoryMinutesMap.set(cat.displayName, 0);
	}

	let uncategorizedMinutes = 0;
	const recentNotesSummary: NoteActivitySummary[] = [];

	// Sort recentParsed newest-first for activity list summary
	//
	// The future bound is applied HERE as well, so the function is
	// self-consistent no matter what the caller passes in: a note dated
	// after today can never contribute to the totals, the category
	// breakdown, the activity list, or the daily average.
	const sortedRecentParsed = [...recentParsed]
		.filter(({ date }) => isOnOrBeforeToday(date, today))
		.sort((a, b) => b.date.getTime() - a.date.getTime());

	for (const { date, path, parsed } of sortedRecentParsed) {
		let noteEventMinutes = 0;
		const noteCategoryMinutesMap = new Map<string, number>();

		for (const item of parsed.timeline) {
			const dur = timelineDurationMinutes(item);
			recentEventMinutes += dur;
			noteEventMinutes += dur;

			// Case-insensitive match on displayName — the SAME rule the
			// category-badge renderer and the sidebar use (see
			// findCategoryByDisplayName). A category string that doesn't
			// match any configured category (renamed/deleted since the line
			// was written, see settings.ts CustomCategory) is folded into
			// "uncategorized" here instead of being tracked under its own
			// stale key and silently excluded from categoryBreakdown below.
			const cat = findCategoryByDisplayName(categories, item.category);
			if (cat) {
				categoryMinutesMap.set(cat.displayName, (categoryMinutesMap.get(cat.displayName) ?? 0) + dur);
				noteCategoryMinutesMap.set(cat.displayName, (noteCategoryMinutesMap.get(cat.displayName) ?? 0) + dur);
			} else {
				uncategorizedMinutes += dur;
				noteCategoryMinutesMap.set(uncategorizedLabel, (noteCategoryMinutesMap.get(uncategorizedLabel) ?? 0) + dur);
			}
		}

		let noteTopCategory: string | null = null;
		let noteMaxMin = 0;
		for (const [catName, mins] of noteCategoryMinutesMap.entries()) {
			if (mins > noteMaxMin) {
				noteMaxMin = mins;
				noteTopCategory = catName;
			}
		}

		// A note counts toward the daily average only if it recorded time.
		if (noteEventMinutes > 0) daysWithRecordedTime.add(formatDateBasename(date));

		recentNotesSummary.push({
			date,
			path,
			eventMinutes: noteEventMinutes,
			topCategory: noteTopCategory,
		});
	}

	// Calculate overall category breakdown.
	//
	// Categories are keyed by display name, so two categories sharing a name
	// would both be credited with the same minutes and the totals would be
	// doubled. The settings screen refuses to create such a pair, but a
	// settings file written by an older version could still contain one, so
	// only the FIRST category with a given name contributes a breakdown row.
	const categoryBreakdown: CategoryStatItem[] = [];
	const seenDisplayNames = new Set<string>();
	for (const cat of categories) {
		if (seenDisplayNames.has(cat.displayName)) continue;
		seenDisplayNames.add(cat.displayName);

		const mins = categoryMinutesMap.get(cat.displayName) ?? 0;
		if (mins > 0) {
			const percentage = recentEventMinutes > 0 ? Math.round((mins / recentEventMinutes) * 100) : 0;
			categoryBreakdown.push({
				displayName: cat.displayName,
				color: cat.color,
				minutes: mins,
				percentage,
			});
		}
	}

	if (uncategorizedMinutes > 0) {
		const percentage = recentEventMinutes > 0 ? Math.round((uncategorizedMinutes / recentEventMinutes) * 100) : 0;
		categoryBreakdown.push({
			displayName: uncategorizedLabel,
			color: "var(--text-faint)",
			minutes: uncategorizedMinutes,
			percentage,
		});
	}

	categoryBreakdown.sort((a, b) => b.minutes - a.minutes);

	const topCategoryName = categoryBreakdown.length > 0 ? categoryBreakdown[0].displayName : null;
	// "Daily Avg" = the window's total recorded time divided by the number
	// of days that recorded time. Dividing by the number of NOTES was
	// wrong twice over: a note that recorded nothing was counted as a
	// zero-minute day, and two files carrying the same date were counted
	// as two separate days.
	const avgEventMinutesPerDay =
		daysWithRecordedTime.size > 0 ? Math.round(recentEventMinutes / daysWithRecordedTime.size) : 0;

	return {
		totalNotes: countedNoteDates.length,
		oldestDate,
		newestDate,
		currentStreak,
		recentEventMinutes,
		avgEventMinutesPerDay,
		topCategoryName,
		categoryBreakdown,
		recentNotesSummary,
	};
}
