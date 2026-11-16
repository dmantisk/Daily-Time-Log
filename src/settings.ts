import { DEFAULT_EVENT_HEADING, type MarkerLanguage } from "./parser";

export type LanguagePreference = MarkerLanguage | "auto";

/**
 * A Timeline category (AGENTS.md 1.4.1) — its `displayName` is what actually
 * gets written into note bodies (`- HH:mm - HH:mm [displayName] ...`), so
 * renaming a category does NOT retroactively relabel already-written lines.
 * `name` is a stable key used only for settings-side bookkeeping (matching
 * "is this a default category" for the reset/delete-guard logic below).
 */
export interface CustomCategory {
	name: string;
	displayName: string;
	color: string;
	isDefault?: boolean;
}

/**
 * Why a proposed category display name was rejected.
 *
 * - `empty`: the name is blank. A blank name cannot be written into a
 *   note — the category token is `[Name]`, and an empty token would
 *   produce `- 09:00 - 10:00 [] text`, which the parser reads back as
 *   "uncategorized" rather than as the category the user just named.
 * - `duplicate`: another category already uses this display name. The
 *   dashboard keys its per-category totals by display name, so two
 *   categories sharing one name would each be credited with the same
 *   minutes and the totals would be doubled.
 */
export type CategoryNameProblem = "empty" | "duplicate";

/**
 * Finds the configured category whose display name matches the given text.
 *
 * Matching is case-insensitive and trims surrounding whitespace, and it is
 * the SINGLE rule used everywhere a category token is resolved: the
 * category-badge renderer, the sidebar timeline, and the dashboard. They
 * must agree — otherwise a token like `[work]` would be drawn with the
 * configured `Work` colour in the note while being counted as
 * uncategorized in the sidebar and the dashboard.
 *
 * Returns `undefined` when nothing matches, which callers render as an
 * uncategorized item.
 */
export function findCategoryByDisplayName(
	categories: CustomCategory[],
	name: string | undefined
): CustomCategory | undefined {
	if (!name) return undefined;
	const lower = name.trim().toLowerCase();
	if (!lower) return undefined;
	return categories.find((cat) => cat.displayName.trim().toLowerCase() === lower);
}

/**
 * Validates a proposed category display name against the other categories.
 *
 * `categories` is the full list and `ignoreIndex` is the index of the
 * category being edited — its own current name must not count as a
 * duplicate of itself, so renaming a category to the name it already has
 * is allowed.
 *
 * Comparison is case-insensitive, matching the "already exists" check the
 * settings screen has always used when adding a category.
 */
export function validateCategoryName(
	categories: CustomCategory[],
	name: string,
	ignoreIndex?: number
): CategoryNameProblem | null {
	const trimmed = name.trim();
	if (!trimmed) return "empty";

	const lower = trimmed.toLowerCase();
	const duplicate = categories.some(
		(cat, index) => index !== ignoreIndex && cat.displayName.trim().toLowerCase() === lower
	);
	return duplicate ? "duplicate" : null;
}

/** Ported from DayTime Tracker's DEFAULT_CATEGORIES — colors match design.md §2.1's existing pastel palette exactly. */
export const DEFAULT_CATEGORIES: CustomCategory[] = [
	{ name: "Work", displayName: "Work", color: "#d0e1fd", isDefault: true },
	{ name: "Study", displayName: "Study", color: "#ebd3f8", isDefault: true },
	{ name: "Rest", displayName: "Rest", color: "#d1f2e5", isDefault: true },
	{ name: "Reading", displayName: "Reading", color: "#fdecd0", isDefault: true },
	{ name: "Exercise", displayName: "Exercise", color: "#e2e5e9", isDefault: true },
];

/**
 * Returns a fresh copy of a category list.
 *
 * The copy must be DEEP: the settings screen mutates category objects in
 * place (renaming changes `displayName`, the colour picker changes
 * `color`), so a shallow copy of the array would leave the copied
 * entries sharing the very same objects. Editing a category would then
 * permanently alter the source list, and a later reset would restore the
 * edited values instead of the originals.
 */
export function copyCategories(categories: CustomCategory[]): CustomCategory[] {
	return categories.map((cat) => ({ ...cat }));
}

/**
 * Returns a fresh copy of the default categories.
 *
 * See `copyCategories` for why the copy must be deep: `DEFAULT_CATEGORIES`
 * must never be reachable from the mutable settings state.
 */
export function createDefaultCategories(): CustomCategory[] {
	return copyCategories(DEFAULT_CATEGORIES);
}

export interface DailyWorkLogSettings {
	/**
	 * Controls the plugin interface language only.
	 * "auto" follows Obsidian's UI language; "en" and "ko" are explicit overrides.
	 *
	 * The Event heading is deliberately NOT localized — it is part of the note
	 * FORMAT, not a UI string, so it must not change with the interface
	 * language. See `resolveEventHeadingText`.
	 */
	language: LanguagePreference;
	/** Markdown heading text that starts the Event block in daily notes. */
	eventHeadingText: string;
	/** Markdown heading level (1-6) used for the Event block. */
	eventHeadingLevel: number;
	/** Grid timeline's displayed start time in minutes since midnight (0-1430, 10-min increments). */
		dayStartMinutes: number;
		/** Grid timeline's displayed end time in minutes since midnight (0-1430, 10-min increments). */
		dayEndMinutes: number;
	/** Whether event time ranges use tabular numerals in the editor and reading view. */
	tabularTimeRanges: boolean;
	/** Up to 10 entries; see CustomCategory for how these map into note bodies. */
	categories: CustomCategory[];
}

export const DEFAULT_SETTINGS: DailyWorkLogSettings = {
	language: "auto",
	// The parser's default heading is the single source of truth, so the
	// settings UI can never offer something the parser would not accept.
	eventHeadingText: DEFAULT_EVENT_HEADING.text,
	eventHeadingLevel: DEFAULT_EVENT_HEADING.level,
	dayStartMinutes: 0,
	dayEndMinutes: 0, // 0 means midnight next day (full 24-hour timeline)
	tabularTimeRanges: true,
	categories: createDefaultCategories(),
};

/**
 * Resolves the Event heading text from persisted settings.
 *
 * Falls back to the default when the stored value is missing, not a string,
 * empty after trimming, or spans more than one line (a heading is a single
 * line by definition).
 *
 * The default is language-INDEPENDENT. The Event heading is part of the
 * note format, so it must not change when the interface language changes:
 * a Korean user who never touched the setting still gets the same heading
 * as everyone else, and the settings UI shows exactly what the parser
 * looks for.
 */
export function resolveEventHeadingText(value: unknown): string {
	if (typeof value !== "string") return DEFAULT_SETTINGS.eventHeadingText;
	const trimmed = value.trim();
	if (!trimmed || /[\r\n]/.test(trimmed)) return DEFAULT_SETTINGS.eventHeadingText;
	return trimmed;
}

/**
 * Resolves the Event heading level from persisted settings.
 * Falls back to the default unless the value is an integer 1-6.
 */
export function resolveEventHeadingLevel(value: unknown): number {
	if (!Number.isInteger(value)) return DEFAULT_SETTINGS.eventHeadingLevel;
	const level = value as number;
	if (level < 1 || level > 6) return DEFAULT_SETTINGS.eventHeadingLevel;
	return level;
}

/**
 * Resolves start/end hour from persisted settings.
 * Falls back to default unless value is an integer 0-24.
 * @deprecated Use resolveMinutes instead for new minute-based settings.
 */
export function resolveHour(value: unknown, defaultValue: number): number {
	if (!Number.isInteger(value)) return defaultValue;
	const hour = value as number;
	if (hour < 0 || hour > 24) return defaultValue;
	return hour;
}

/**
 * Validates a minute value for timeline settings.
 * Must be an integer 0-1430, multiple of 10.
 */
export function isValidMinutes(value: unknown): boolean {
	if (!Number.isInteger(value)) return false;
	const minutes = value as number;
	return minutes >= 0 && minutes <= 1430 && minutes % 10 === 0;
}

/**
 * Resolves minute-based timeline setting from persisted settings.
 * Falls back to default unless value is a valid minute value (0-1430, multiple of 10).
 */
export function resolveMinutes(value: unknown, defaultValue: number): number {
	if (!isValidMinutes(value)) return defaultValue;
	return value as number;
}

/**
 * Type guard to check if a value is a valid minute value.
 */
export function isValidMinuteValue(value: unknown): value is number {
	return isValidMinutes(value);
}

/**
 * Resolves minute-based timeline setting from persisted settings with type narrowing.
 * Falls back to default unless value is a valid minute value (0-1430, multiple of 10).
 */
export function resolveMinutesSafe(value: unknown, defaultValue: number): number {
	if (!isValidMinutes(value)) return defaultValue;
	return value as number;
}

/**
 * Calculates the timeline duration in minutes from start and end minutes.
 * - If end > start: duration = end - start
 * - If end < start: duration = (1440 - start) + end (crosses midnight)
 * - If end = start: duration = 1440 (full 24-hour timeline)
 */
export function calculateTimelineDuration(startMinutes: number, endMinutes: number): number {
	if (endMinutes > startMinutes) {
		return endMinutes - startMinutes;
	}
	if (endMinutes < startMinutes) {
		return (1440 - startMinutes) + endMinutes;
	}
	// endMinutes === startMinutes means full 24-hour timeline
	return 1440;
}

/**
 * Checks if a time (in minutes since midnight) falls within the configured timeline window.
 * Handles overnight ranges correctly.
 */
export function isTimeInWindow(timeMinutes: number, startMinutes: number, endMinutes: number): boolean {
	if (endMinutes > startMinutes) {
		return timeMinutes >= startMinutes && timeMinutes < endMinutes;
	}
	if (endMinutes < startMinutes) {
		// Overnight range: time is in window if it's >= start OR < end
		return timeMinutes >= startMinutes || timeMinutes < endMinutes;
	}
	// endMinutes === startMinutes means full 24-hour timeline
	return true;
}

/**
 * Returns the number of 10-minute cells in the timeline.
 */
export function getTimelineCellCount(startMinutes: number, endMinutes: number): number {
	const duration = calculateTimelineDuration(startMinutes, endMinutes);
	return duration / 10;
}

/**
 * Converts a timeline-relative cell index (0-based) to clock time in minutes since midnight.
 */
export function cellIndexToTime(cellIndex: number, startMinutes: number): number {
	return (startMinutes + cellIndex * 10) % 1440;
}

/**
 * Converts a clock time (minutes since midnight) to a timeline-relative cell index.
 * Returns -1 if the time is not in the timeline window.
 */
export function timeToCellIndex(timeMinutes: number, startMinutes: number, endMinutes: number): number {
	if (!isTimeInWindow(timeMinutes, startMinutes, endMinutes)) {
		return -1;
	}
	if (timeMinutes >= startMinutes) {
		return Math.floor((timeMinutes - startMinutes) / 10);
	}
	// Time is before start (overnight case)
	return Math.floor((1440 - startMinutes + timeMinutes) / 10);
}

/**
 * Migrates legacy hour-based settings to minute-based settings.
 * - Converts startHour to minutes (startHour * 60)
 * - Converts endHour to minutes (endHour * 60), with special case: 24 -> 0 (midnight next day)
 * - Preserves effective duration of existing configurations
 * - Maps original default (0-24) to full 24-hour timeline (0-1440)
 */
export function migrateLegacyHoursToMinutes(
	legacyStartHour: number | undefined,
	legacyEndHour: number | undefined
): { dayStartMinutes: number; dayEndMinutes: number } {
	// Default to original defaults if legacy values missing
	const startHour = typeof legacyStartHour === 'number' && legacyStartHour >= 0 && legacyStartHour <= 24
		? legacyStartHour
		: 0; // Old default was 0
	const endHour = typeof legacyEndHour === 'number' && legacyEndHour >= 0 && legacyEndHour <= 24
		? legacyEndHour
		: 24; // Old default was 24

	// Convert to minutes
	const dayStartMinutes = startHour * 60;
	// Special case: endHour 24 means midnight next day -> 0 minutes
	const dayEndMinutes = endHour === 24 ? 0 : endHour * 60;

	return { dayStartMinutes, dayEndMinutes };
}
