/**
 * Pure parsing utilities for Daily Work Log notes.
 * ZERO Obsidian API dependency — must stay unit-testable in plain Node/Vitest.
 * See .agents/AGENTS.md section 1 for the full spec these functions implement.
 */

export interface TimelineItem {
	line: number;
	/** Number of physical lines this item occupies, including any absorbed continuation lines (AGENTS.md 1.4.2). Always >= 1. */
	lineCount: number;
	start: string;
	end: string;
	/** Category display name, verbatim as stored in the body (AGENTS.md 1.4.1). `undefined` = uncategorized (legacy line, or user never set one). */
	category?: string;
	description: string;
}

export interface ParsedDailyNote {
	timeline: TimelineItem[];
}

export interface LineRange {
	/** 0-based, inclusive */
	start: number;
	/** 0-based, inclusive */
	end: number;
}

/**
 * Heading configuration for the single recognized block (Event).
 * `text` is the heading label matched case-insensitively (trimmed);
 * `level` is the heading depth (1-6). Only a heading at exactly this level
 * with this text starts the block; any heading of any level ends it.
 */
export interface EventHeadingConfig {
	text: string;
	level: number;
}

export const DEFAULT_EVENT_HEADING: EventHeadingConfig = { text: "Event", level: 1 };

/** UI language for strings (EN / KO). Kept here for settings/i18n imports. */
export type MarkerLanguage = "en" | "ko";

/**
 * Exported so callers (e.g. view.ts) can re-validate a line before mutating it in place.
 * Group 3 (category) is optional — AGENTS.md 1.4.1: `- HH:mm - HH:mm [Category] description`.
 * Lines written before the category feature existed have no `[...]` token at all and still
 * match, with group 3 `undefined` (see parseTimeline / timelineLineMatches).
 */
export const TIME_RANGE_REGEX = /^[-*]\s*(\d{1,2}:\d{2})\s*[-~]\s*(\d{1,2}:\d{2})\s*(?:\[([^\]]*)\]\s*)?(.*)$/;
const CHECKBOX_REGEX = /^[-*]\s*\[([ xX])\]\s*(.*)$/;
/**
 * Strict "HH:mm" validation for a single user-entered time VALUE (hours
 * 00-23, minutes 00-59) — e.g. TimelineModal's start/end inputs. This is
 * deliberately stricter than TIME_RANGE_REGEX above, which only extracts
 * the shape `\d{1,2}:\d{2}` out of an existing line and doesn't range-check
 * it (that regex's job is finding/parsing lines, not validating new input).
 */
export const TIME_VALUE_REGEX = /^(?:[01]?\d|2[0-3]):[0-5]\d$/;

/**
 * Matches `[Category]` only when it sits directly after a time range
 * (`- HH:mm - HH:mm [Category]`), i.e. in exact event-line position. This
 * prevents brackets typed anywhere else in a note (diary prose, headings,
 * checkboxes, wikilinks) from being rendered as category badges.
 *
 * Uses negative lookbehind/lookahead for brackets, excludes `[ ]`, `[x]`,
 * `[X]`, and supports Unicode category names. Group 1 = the category text
 * inside the brackets.
 */
export const CATEGORY_BADGE_REGEX_SOURCE =
	"(?<=\\d{1,2}:\\d{2}\\s*[-~]\\s*\\d{1,2}:\\d{2}\\s*)\\[(?![ xX]\\])([^\\x00-\\x1F\\[\\]\\r\\n]+?)\\](?!\\])";

const FRONTMATTER_DELIMITER = "---";

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * True when `line` is the configured event marker heading — exactly
 * `level` `#` characters followed by `text` (case-insensitive, trimmed).
 *
 * ONLY the configured heading is recognized. There is no hard-coded
 * fallback list of historical spellings — if the user changes the Event
 * heading in Settings, notes using the old heading stop being treated as
 * an Event block (they fall back to whole-note scanning).
 */
export function matchMarker(line: string, config: EventHeadingConfig): boolean {
	const trimmed = line.trim();
	if (!Number.isInteger(config.level) || config.level < 1 || config.level > 6 || !config.text.trim()) return false;
	const headingRegex = new RegExp(`^#{${config.level}}\\s+(${escapeRegExp(config.text.trim())})\\s*$`, "i");
	return headingRegex.test(trimmed);
}

/**
 * Strips a trailing CRLF `\r` only — NOT a general whitespace trim.
 */
function stripTrailingCarriageReturn(line: string): string {
	return line.endsWith("\r") ? line.slice(0, -1) : line;
}

/**
 * Strips a leading YAML frontmatter block (line 0 must be exactly `---`,
 * closed by the next line that is exactly `---`). Line indices in the
 * returned `lines` array stay relative to the original file — callers get a
 * `bodyStart` offset to scan from instead of a re-numbered array.
 */
export function stripFrontmatter(content: string): { lines: string[]; bodyStart: number } {
	const lines = content.split("\n");

	if (stripTrailingCarriageReturn(lines[0] ?? "") !== FRONTMATTER_DELIMITER) {
		return { lines, bodyStart: 0 };
	}

	for (let i = 1; i < lines.length; i++) {
		if (stripTrailingCarriageReturn(lines[i]) === FRONTMATTER_DELIMITER) {
			return { lines, bodyStart: i + 1 };
		}
	}

	// No closing delimiter found: not a valid frontmatter block, parse from the top.
	return { lines, bodyStart: 0 };
}

/**
 * Finds the single Event block in the file.
 *
 * Rule: the block starts at the first occurrence of the configured event
 * marker heading (exact level + text, case-insensitive). The block ends at
 * the next heading of ANY level (H1–H6), or at EOF — any heading terminates
 * the block (subheadings do not nest inside the Event block).
 *
 * Returns { start, end } inclusive line indices, or null if no marker found.
 * When null is returned, callers should fall back to legacy mode (scan
 * entire body for time-range lines).
 */
export function findEventBlock(
	lines: string[],
	bodyStart: number,
	config: EventHeadingConfig
): LineRange | null {
	let blockStart: number | null = null;

	for (let i = bodyStart; i < lines.length; i++) {
		const line = lines[i];
		const trimmed = line.trim();

		if (blockStart === null) {
			if (matchMarker(line, config)) {
				blockStart = i;
			}
			continue;
		}

		if (/^#{1,6}\s/.test(trimmed)) {
			return { start: blockStart, end: i - 1 };
		}
	}

	if (blockStart !== null) {
		return { start: blockStart, end: lines.length - 1 };
	}

	return null;
}

/**
 * Parses Timeline items from a contiguous line range.
 * Implements AGENTS.md 1.4.2 continuation-line absorption:
 * - A line matching TIME_RANGE_REGEX starts a new item.
 * - A non-matching, non-heading line is absorbed verbatim into the previous
 *   item's description (joined with `\n`).
 * - A second consecutive blank line stops the run.
 * - Any heading or time-range line resets the "current item" pointer.
 */
export function parseTimeline(lines: string[], range: LineRange): TimelineItem[] {
	const items: TimelineItem[] = [];
	let current: TimelineItem | null = null;
	let previousWasBlank = false;

	for (const { text, line } of linesInRange(lines, range)) {
		const trimmed = text.trim();

		if (trimmed === "") {
			if (previousWasBlank) {
				current = null;
			} else if (current) {
				current.lineCount++;
			}
			previousWasBlank = true;
			continue;
		}

		const hadBlankContinuation = previousWasBlank;
		previousWasBlank = false;

		const match = TIME_RANGE_REGEX.exec(text);
		if (match) {
			current = {
				line,
				lineCount: 1,
				start: match[1],
				end: match[2],
				category: match[3] || undefined,
				description: match[4].trim(),
			};
			items.push(current);
			continue;
		}

		if (/^#{1,6}\s/.test(trimmed)) {
			current = null;
			continue;
		}

		if (CHECKBOX_REGEX.test(text)) {
			current = null;
			continue;
		}

		if (current) {
			current.description += (hadBlankContinuation ? "\n\n" : "\n") + text;
			current.lineCount++;
			continue;
		}
	}

	return items;
}

function* linesInRange(lines: string[], range: LineRange): Generator<{ text: string; line: number }> {
	for (let i = range.start; i <= range.end && i < lines.length; i++) {
		yield { text: lines[i], line: i };
	}
}

/**
 * Full pipeline: frontmatter strip -> find configured Event block -> parse
 * timeline items within it.
 *
 * If the configured marker heading is not found anywhere in the file,
 * falls back to legacy mode: scan the whole body for time-range lines
 * (existing notes without the marker keep working).
 */
export function parseDailyNote(
	content: string,
	config: EventHeadingConfig = DEFAULT_EVENT_HEADING
): ParsedDailyNote {
	const { lines, bodyStart } = stripFrontmatter(content);
	const block = findEventBlock(lines, bodyStart, config);

	let timeline: TimelineItem[];

	if (block) {
		timeline = parseTimeline(lines, block);
	} else {
		timeline = parseTimeline(lines, { start: bodyStart, end: lines.length - 1 });
	}

	return { timeline };
}

/**
 * True when `line` must never be silently absorbed as a continuation/note
 * line of a preceding Timeline item: a time-range line, a checkbox, or a
 * heading must remain independent note content rather than event detail.
 * Exported so `TimelineModal` can reject a description whose continuation
 * lines would misparse on the next read, instead of silently losing them.
 */
export function isTopLevelOrMarker(line: string): boolean {
	return TIME_RANGE_REGEX.test(line) || CHECKBOX_REGEX.test(line) || /^#{1,6}\s/.test(line.trim());
}

/**
 * Replaces a single line at the given index (0-based).
 */
export function replaceLineAt(content: string, lineIndex: number, newLine: string): string {
	const lines = content.split("\n");
	lines[lineIndex] = newLine;
	return lines.join("\n");
}

/**
 * Replaces a range of lines (inclusive start, lineCount lines) with a single
 * new line. Used when editing an event item that spans multiple physical
 * lines due to continuation lines.
 */
export function replaceLineRangeAt(content: string, lineIndex: number, lineCount: number, newLine: string): string {
	const lines = content.split("\n");
	lines.splice(lineIndex, lineCount, newLine);
	return lines.join("\n");
}

/**
 * Removes a range of lines (inclusive start, lineCount lines).
 */
export function removeLineRangeAt(content: string, lineIndex: number, lineCount: number): string {
	const lines = content.split("\n");
	lines.splice(lineIndex, lineCount);
	return lines.join("\n");
}

/** Same staleness guard as `timelineLineMatches`, for Timeline/Event items. */
export function timelineLineMatches(line: string, item: TimelineItem): boolean {
	const match = TIME_RANGE_REGEX.exec(line);
	if (match === null) return false;
	const category = match[3] ? match[3] : undefined;
	return (
		match[1] === item.start &&
		match[2] === item.end &&
		category === item.category &&
		match[4].trim() === item.description
	);
}

/** Same as `timelineLineMatches`, for range-based validation. */
export function timelineRangeMatches(lines: string[], item: TimelineItem): boolean {
	const reparsed = parseTimeline(lines, { start: item.line, end: item.line + item.lineCount - 1 });
	if (reparsed.length !== 1) return false;
	const candidate = reparsed[0];
	return (
		candidate.start === item.start &&
		candidate.end === item.end &&
		candidate.category === item.category &&
		candidate.description === item.description
	);
}

/**
 * Appends `newLine` to the end of the Event block's content (or to the end
 * of the whole file if that block isn't present — e.g. a legacy file,
 * or one missing that particular marker). Used for inline Event creation.
 * Frontmatter and other blocks are left untouched; the new line always
 * lands just before the next block's marker (or EOF).
 */
export function appendLineToBlock(
	content: string,
	newLine: string,
	config: EventHeadingConfig = DEFAULT_EVENT_HEADING
): string {
	const { lines, bodyStart } = stripFrontmatter(content);
	const block = findEventBlock(lines, bodyStart, config);

	if (!block) {
		return appendAtEndOfFile(lines, newLine);
	}

	const insertAt = block.end + 1;
	if (insertAt >= lines.length) {
		return appendAtEndOfFile(lines, newLine);
	}

	return [...lines.slice(0, insertAt), newLine, ...lines.slice(insertAt)].join("\n");
}

function appendAtEndOfFile(lines: string[], newLine: string): string {
	if (lines.length > 0 && lines[lines.length - 1] === "") {
		return [...lines.slice(0, -1), newLine, ""].join("\n");
	}
	return [...lines, newLine].join("\n");
}

const MINUTES_PER_DAY = 24 * 60;

/** Parses "HH:mm" into minutes-since-midnight. */
export function timeToMinutes(hhmm: string): number {
	const [hours, minutes] = hhmm.split(":").map(Number);
	return hours * 60 + minutes;
}

/** Inverse of `timeToMinutes` — formats minutes-since-midnight as zero-padded "HH:mm". Used by the grid's drag-to-select. */
export function minutesToTime(minutes: number): string {
	const hours = Math.floor(minutes / 60);
	const mins = minutes % 60;
	return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

/**
 * Duration of a Timeline/Event item in minutes. If `end` is not after
 * `start`, the range is treated as crossing midnight (e.g. 23:00-01:00).
 * Shared by the Timeline component (bar height) and the Dashboard's
 * "total recorded time" aggregate so the two never drift apart.
 */
export function timelineDurationMinutes(item: Pick<TimelineItem, "start" | "end">): number {
	const startMinutes = timeToMinutes(item.start);
	const endMinutes = timeToMinutes(item.end);
	return Math.max(endMinutes - startMinutes + (endMinutes <= startMinutes ? MINUTES_PER_DAY : 0), 0);
}

const HTML_ENTITIES: Record<string, string> = {
	"&nbsp;": " ",
	"&amp;": "&",
	"&lt;": "<",
	"&gt;": ">",
	"&quot;": '"',
	"&#39;": "'",
};

/**
 * Strips HTML tags (e.g. from notes edited with a rich-text/formatting
 * plugin like Obsidian's Editing Toolbar) for **display purposes only** —
 * callers must never write the stripped result back to the note file, only
 * use it where raw note text is rendered in the sidebar. The
 * source of truth in the file keeps its original HTML untouched.
 */
export function stripHtml(text: string): string {
	return text.replace(/<[^>]*>/g, "").replace(/&[a-zA-Z]+;|&#\\d+;/g, (entity) => HTML_ENTITIES[entity] ?? entity);
}