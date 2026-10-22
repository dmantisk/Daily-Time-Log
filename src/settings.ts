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
	/** Grid timeline's displayed hour range, inclusive start / exclusive end (0-24). */
	startHour: number;
	endHour: number;
	/** Up to 10 entries; see CustomCategory for how these map into note bodies. */
	categories: CustomCategory[];
}

export const DEFAULT_SETTINGS: DailyWorkLogSettings = {
	language: "auto",
	// The parser's default heading is the single source of truth, so the
	// settings UI can never offer something the parser would not accept.
	eventHeadingText: DEFAULT_EVENT_HEADING.text,
	eventHeadingLevel: DEFAULT_EVENT_HEADING.level,
	startHour: 0,
	endHour: 24,
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
