import type { MarkerLanguage } from "./parser";

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

/** Ported from DayTime Tracker's DEFAULT_CATEGORIES — colors match design.md §2.1's existing pastel palette exactly. */
export const DEFAULT_CATEGORIES: CustomCategory[] = [
	{ name: "Work", displayName: "Work", color: "#d0e1fd", isDefault: true },
	{ name: "Study", displayName: "Study", color: "#ebd3f8", isDefault: true },
	{ name: "Rest", displayName: "Rest", color: "#d1f2e5", isDefault: true },
	{ name: "Reading", displayName: "Reading", color: "#fdecd0", isDefault: true },
	{ name: "Exercise", displayName: "Exercise", color: "#e2e5e9", isDefault: true },
];

export interface DailyWorkLogSettings {
	/**
	 * Controls the plugin interface language and the default Event heading.
	 * Parsing always recognizes every supported language's Event headings
	 * regardless of this setting.
	 * "auto" follows Obsidian's UI language; "en" and "ko" are explicit overrides.
	 */
	language: LanguagePreference;
	/** Markdown heading text that starts the Event block in daily notes. */
	eventHeadingText: string;
	/** Markdown heading level (1-6) used for the Event block. */
	eventHeadingLevel: number;
	/** Grid timeline's displayed hour range, inclusive start / exclusive end (0-24). */
	startHour: number;
	endHour: number;
	/** Optional vault-relative folder filter for daily-note scanning. Empty string = whole vault. */
	dailyNoteFolder: string;
	/** Up to 10 entries; see CustomCategory for how these map into note bodies. */
	categories: CustomCategory[];
}

export const DEFAULT_SETTINGS: DailyWorkLogSettings = {
	language: "auto",
	eventHeadingText: "Event",
	eventHeadingLevel: 1,
	startHour: 0,
	endHour: 24,
	dailyNoteFolder: "",
	categories: [...DEFAULT_CATEGORIES],
};
