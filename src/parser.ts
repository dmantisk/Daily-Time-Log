/**
 * Pure parsing utilities for Daily Work Log notes.
 * ZERO Obsidian API dependency — must stay unit-testable in plain Node/Vitest.
 * See AGENTS-reference.md for the full spec these functions implement.
 */

export * from "./parser/time-math";

export * from "./parser/html";

export * from "./parser/heading-normalization";

import {
	type EventHeadingConfig,
	DEFAULT_EVENT_HEADING,
	headingLevel,
	matchMarker,
	normalizeHeadingText,
	normalizeRenderedHeadingText,
} from "./parser/heading-normalization";

export interface TimelineItem {
	line: number;
	/** Number of physical lines this item occupies, including any absorbed continuation lines (AGENTS-reference.md). Always >= 1. */
	lineCount: number;
	start: string;
	end: string;
	/** Category display name, verbatim as stored in the body (AGENTS-reference.md). `undefined` = uncategorized (legacy line, or user never set one). */
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
 * Exported so callers (e.g. view.ts) can re-validate a line before mutating it in place.
 * Group 3 (category) is optional — AGENTS-reference.md: `- HH:mm - HH:mm [Category] description`.
 * Lines written before the category feature existed have no `[...]` token at all and still
 * match, with group 3 `undefined` (see parseTimeline / timelineLineMatches).
 */
export const TIME_RANGE_REGEX = /^[-*]\s*(\d{1,2}:\d{2})\s*[-~]\s*(\d{1,2}:\d{2})\s*(?:\[([^[\]]*)\]\s*)?(.*)$/;
const CHECKBOX_REGEX = /^[-*]\s*\[([ xX])\]\s*(.*)$/;

/**
 * Matches `[Category]` only when it sits directly after a time range
 * (`- HH:mm - HH:mm [Category]`), i.e. in exact event-line position. This
 * prevents brackets typed anywhere else in a note (diary prose, headings,
 * checkboxes, wikilinks) from being rendered as category badges.
 *
 * Matches the time range as part of the pattern instead of using lookbehind,
 * so it works on older iOS JavaScript engines. Group 1 = the category text
 * inside the brackets.
 */
export const CATEGORY_BADGE_REGEX_SOURCE =
	"\\d{1,2}:\\d{2}\\s*[-~]\\s*\\d{1,2}:\\d{2}\\s*\\[(?![ xX]\\])([^\\x00-\\x1F\\[\\]\\r\\n]+?)\\](?!\\])";

const FRONTMATTER_DELIMITER = "---";


/**
 * Strips a trailing CRLF `\r` only — NOT a general whitespace trim.
 */
function stripTrailingCarriageReturn(line: string): string {
	return line.endsWith("\r") ? line.slice(0, -1) : line;
}

/**
 * Splits `content` into lines, dropping the line terminators.
 *
 * A CRLF file splits on `"\n"` and leaves a trailing `"\r"` on every line,
 * and JavaScript's `.` does **not** match `\r` — so `TIME_RANGE_REGEX`, which
 * ends in `(.*)$`, would fail to match EVERY event line in such a note and
 * the note would parse as having no events at all. Stripping the trailing
 * `"\r"` here makes the parse line-ending agnostic.
 *
 * The line COUNT is unchanged by this, so line indices stay relative to the
  * original file (AGENTS-reference.md).
 */
export function splitContentLines(content: string): string[] {
	return content.split("\n").map(stripTrailingCarriageReturn);
}

/**
 * The line ending a file uses: `"\r\n"` if it contains one, otherwise `"\n"`.
 *
 * The write path must re-join lines with the ending the file already uses —
 * otherwise editing one line in a CRLF note converts just that line to LF and
 * the file ends up with mixed line endings.
 */
function detectLineEnding(content: string): string {
	return content.includes("\r\n") ? "\r\n" : "\n";
}

/**
 * Re-joins `lines` with the line ending the original `content` used, so a
 * write never changes the file's line-ending style.
 */
function joinLines(lines: string[], content: string): string {
	return lines.join(detectLineEnding(content));
}

/**
 * Strips a leading YAML frontmatter block (line 0 must be exactly `---`,
 * closed by the next line that is exactly `---`). Line indices in the
 * returned `lines` array stay relative to the original file — callers get a
 * `bodyStart` offset to scan from instead of a re-numbered array.
 */
export function stripFrontmatter(content: string): { lines: string[]; bodyStart: number } {
	const lines = splitContentLines(content);

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
 * Matches an opening or closing code fence: three or more backticks, or
 * three or more tildes. CommonMark allows a fence to be indented by up to
 * three spaces, which the leading ` {0,3}` covers.
 */
const CODE_FENCE_REGEX = /^ {0,3}(`{3,}|~{3,})/;

/**
 * Tracks whether the parser is currently inside a fenced code block.
 *
 * A fenced block is a boundary for the parser, exactly as it is for the
 * Markdown renderer: a `#` line inside a ``` fence is CODE, not a heading,
 * so it must not close the Event section; and an event-shaped line inside a
 * fence is not an Event.
 *
 * The fence character and its length are remembered, because CommonMark
 * requires the closing fence to use the same character as the one that
 * opened it (a ``` fence is not closed by a ~~~ line) and to be at least as
 * long as the opener.
 */
class FenceTracker {
	/** The fence character that opened the current block ("`" or "~"), or null when outside a fence. */
	private char: string | null = null;
	/** The length of the opening fence. */
	private length = 0;

	/**
	 * Feeds one line to the tracker and returns true when the line is part
	 * of a fenced code block — the opening fence, any line it contains, or
	 * the closing fence.
	 *
	 * The tracker must be fed EVERY line, whether or not the caller cares
	 * about it, because the fence state carries from line to line.
	 */
	consume(line: string): boolean {
		const match = CODE_FENCE_REGEX.exec(line);

		if (this.char === null) {
			if (match && isOpeningFence(line, match)) {
				this.char = match[1][0];
				this.length = match[1].length;
				return true;
			}
			return false;
		}

		// Inside a fence: only a closing fence of the same character, at
		// least as long as the opener, and with nothing else on the line,
		// ends the block. Anything else is ordinary fence content.
		if (match && this.isClosingFence(line, match)) {
			this.char = null;
			this.length = 0;
		}
		return true;
	}

	/**
	 * True when `line` closes the currently open fence: the same fence
	 * character, at least as long as the opener, and with nothing but
	 * whitespace after it.
	 */
	private isClosingFence(line: string, match: RegExpExecArray): boolean {
		if (match[1][0] !== this.char) return false;
		if (match[1].length < this.length) return false;
		return line.trim() === match[0].trim();
	}
}

/**
 * True when `line` opens a fence. A backtick fence's info string may not
 * contain a backtick (` ```a`b ` is not a fence); a tilde fence's info
 * string may.
 */
function isOpeningFence(line: string, match: RegExpExecArray): boolean {
	if (match[1][0] === "`" && line.slice(match[0].length).includes("`")) {
		return false;
	}
	return true;
}

/**
 * Finds the single Event block in the file.
 *
 * Rule: the block starts at the first occurrence of the configured event
 * marker heading (exact level + text, case-insensitive). The block ends at
 * the next heading at the SAME level or above (i.e. a heading whose level is
 * less than or equal to the configured level), or at EOF. Deeper headings
 * (a higher level number) are subheadings of the Event section and stay
 * INSIDE the block.
 *
 * Returns { start, end } inclusive line indices, or null if no marker found.
 * When null is returned the file has no Event block at all — there is no
 * whole-body fallback.
 */
export function findEventBlock(
	lines: string[],
	bodyStart: number,
	config: EventHeadingConfig
): LineRange | null {
	let blockStart: number | null = null;
	const fence = new FenceTracker();

	for (let i = bodyStart; i < lines.length; i++) {
		const line = lines[i];

		// A line inside a fenced code block is CODE, not a heading, so it
		// cannot open the section and cannot close it either. The fence
		// boundary is tracked on every line, whether or not the block has
		// started yet, so a fence that opens BEFORE the Event heading
		// still shields the heading scan.
		const inFence = fence.consume(line);
		if (inFence) continue;

		if (blockStart === null) {
			if (matchMarker(line, config)) {
				blockStart = i;
			}
			continue;
		}

		const level = headingLevel(line);
		// A heading at the same level or above ends the block. Deeper
		// headings (level > config.level) are subheadings of this section
		// and do NOT terminate it.
		if (level !== null && level <= config.level) {
			return { start: blockStart, end: i - 1 };
		}
	}

	if (blockStart !== null) {
		return { start: blockStart, end: lines.length - 1 };
	}

	return null;
}

/**
 * True when `content` contains an Event block for the configured heading.
 * Used by the sidebar to tell the user their note is missing the heading
 * instead of silently showing an empty timeline.
 */
export function hasEventBlock(
	content: string,
	config: EventHeadingConfig = DEFAULT_EVENT_HEADING
): boolean {
	return findEventBlockInContent(content, config) !== null;
}

/**
 * A heading in document order, as seen by the category-badge renderer.
 */
export interface HeadingInfo {
	/** Heading depth, 1-6. */
	level: number;
	/** Heading text, whitespace-normalized. */
	text: string;
}

/**
 * True when a position that follows `headings` (in document order) is inside
 * the configured Event block.
 *
 * Mirrors `findEventBlock` exactly:
 * - The section is opened by the FIRST heading that matches the configured
 *   text AND level. Later headings with the same text do not re-open it.
 * - The section ends at the next heading at the SAME level or above, so a
 *   deeper heading keeps the position inside the section.
 *
 * Consequence: with two `# Event` headings, only the content between the
 * first one and the second is inside the section — exactly the range the
 * parser returns for that file.
 *
 * The heading texts come from the rendered DOM, so they are already
 * undecorated (`<h1><strong>Event</strong></h1>` has the text `Event`).
 * The configured text is normalized to its rendered form with
 * `normalizeHeadingText`, so a setting of `**Event**` matches the same
 * rendered heading as a setting of `Event`.
 *
 * Used by the category-badge renderer, which works from the rendered DOM
 * (headings as `<h1>`–`<h6>` elements) rather than the raw file text.
 */
export function isWithinEventHeading(
	headings: HeadingInfo[],
	config: EventHeadingConfig = DEFAULT_EVENT_HEADING
): boolean {
	const wanted = normalizeHeadingText(config.text).toLowerCase();

	// The section opens at the first heading with the configured text AND level.
	const start = headings.findIndex(
		(heading) =>
			heading.level === config.level &&
			normalizeRenderedHeadingText(heading.text).toLowerCase() === wanted
	);
	if (start === -1) return false;

	// It closes at the next heading at the same level or above.
	for (let i = start + 1; i < headings.length; i++) {
		if (headings[i].level <= config.level) return false;
	}

	return true;
}

/**
 * Convenience wrapper around `stripFrontmatter` + `findEventBlock` for
 * callers that have the raw file content rather than pre-split lines.
 * Line indices are relative to the original file (frontmatter included).
 */
export function findEventBlockInContent(
	content: string,
	config: EventHeadingConfig = DEFAULT_EVENT_HEADING
): LineRange | null {
	const { lines, bodyStart } = stripFrontmatter(content);
	return findEventBlock(lines, bodyStart, config);
}

/**
 * Parses Timeline items from a contiguous line range.
 * Implements AGENTS-reference.md continuation-line absorption:
 * - A line matching TIME_RANGE_REGEX starts a new item.
 * - A non-matching, non-heading line is absorbed verbatim into the previous
 *   item's description (joined with `\n`).
 * - A second consecutive blank line stops the run.
 * - Any heading or time-range line resets the "current item" pointer.
 * - A fenced code block is a boundary: its lines are CODE, so an
 *   event-shaped line inside a fence is not an Event, and the fence is not
 *   absorbed into the preceding item's description.
 */
export function parseTimeline(lines: string[], range: LineRange): TimelineItem[] {
	const items: TimelineItem[] = [];
	let current: TimelineItem | null = null;
	let previousWasBlank = false;
	const fence = new FenceTracker();

	for (const { text, line } of linesInRange(lines, range)) {
		const trimmed = text.trim();

		// A fenced code block is a boundary, exactly as it is for the
		// Markdown renderer: the fence's own lines are CODE. An
		// event-shaped line inside a fence is not an Event, and the fence
		// is not absorbed into the preceding item's description.
		if (fence.consume(text)) {
			current = null;
			previousWasBlank = false;
			continue;
		}

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

		// A checkbox is a top-level marker at ANY indentation: an indented
		// "  - [ ] nested task" is still a to-do the user owns, not detail
		// belonging to the event above it. The line is trimmed before the
		// test so the leading whitespace cannot hide the marker - otherwise
		// the line is absorbed into the event's description, and the next
		// edit or delete of that event silently removes the checkbox with
		// it (data loss).
		if (CHECKBOX_REGEX.test(trimmed)) {
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
 * STRICT SCOPING: if the configured heading is not found anywhere in the
 * file, there is NO fallback — the result is an empty timeline. Events are
 * only ever read from under the configured heading.
 */
export function parseDailyNote(
	content: string,
	config: EventHeadingConfig = DEFAULT_EVENT_HEADING
): ParsedDailyNote {
	const { lines, bodyStart } = stripFrontmatter(content);
	const block = findEventBlock(lines, bodyStart, config);

	if (!block) {
		return { timeline: [] };
	}

	return { timeline: parseTimeline(lines, block) };
}

/**
 * True when `line` must never be silently absorbed as a continuation/note
 * line of a preceding Timeline item: a time-range line, a checkbox, or a
 * heading must remain independent note content rather than event detail.
 * Exported so `TimelineModal` can reject a description whose continuation
 * lines would misparse on the next read, instead of silently losing them.
 */
export function isTopLevelOrMarker(line: string): boolean {
	// The checkbox test is applied to the TRIMMED line: leading whitespace
	// does not change what a line IS. An indented "  - [ ] nested task" is
	// a to-do marker just like a top-level "- [ ] nested task" - it must
	// never be treated as ordinary detail, or the save-time guard would
	// accept a description whose checkbox line would then be lost on the
	// next parse (AGENTS-reference.md).
	//
	// The time-range test stays on the RAW line, because that is exactly
	// what `parseTimeline()` does - the two must agree, or the guard would
	// reject a description the parser handles without trouble.
	return (
		TIME_RANGE_REGEX.test(line) ||
		CHECKBOX_REGEX.test(line.trim()) ||
		/^#{1,6}\s/.test(line.trim())
	);
}

/**
 * Replaces a single line at the given index (0-based).
 */
export function replaceLineAt(content: string, lineIndex: number, newLine: string): string {
	const lines = splitContentLines(content);
	lines[lineIndex] = newLine;
	return joinLines(lines, content);
}

/**
 * Replaces a range of lines (inclusive start, lineCount lines) with a single
 * new line. Used when editing an event item that spans multiple physical
 * lines due to continuation lines.
 */
export function replaceLineRangeAt(content: string, lineIndex: number, lineCount: number, newLine: string): string {
	const lines = splitContentLines(content);
	lines.splice(lineIndex, lineCount, newLine);
	return joinLines(lines, content);
}

/**
 * Removes a range of lines (inclusive start, lineCount lines).
 */
export function removeLineRangeAt(content: string, lineIndex: number, lineCount: number): string {
	const lines = splitContentLines(content);
	lines.splice(lineIndex, lineCount);
	return joinLines(lines, content);
}

/** Same staleness guard as `timelineLineMatches`, for Timeline/Event items. */
export function timelineLineMatches(line: string, item: TimelineItem): boolean {
	const match = TIME_RANGE_REGEX.exec(stripTrailingCarriageReturn(line));
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
 * Appends `newLine` to the end of the Event block's content. Used for
 * inline Event creation.
 *
 * If the note has no Event block yet, the configured heading is added at
 * the end of the file and the new line goes right under it — otherwise the
 * event would land outside every block and never be parsed back (the
 * parser is strictly scoped to the configured heading).
 *
 * When the block does exist, the new line is inserted at the end of the
 * heading's OWN content — i.e. before the first deeper (sub)heading. The
 * Event list therefore stays grouped directly under the configured
 * heading, and nested sections keep their own content.
 */
export function appendLineToBlock(
	content: string,
	newLine: string,
	config: EventHeadingConfig = DEFAULT_EVENT_HEADING
): string {
	const { lines, bodyStart } = stripFrontmatter(content);
	const block = findEventBlock(lines, bodyStart, config);

	if (!block) {
		const heading = `${"#".repeat(config.level)} ${config.text}`;
		const base = lines.length > 0 && lines[lines.length - 1] === "" ? lines.slice(0, -1) : lines;
		return joinLines([...base, heading, newLine, ""], content);
	}

	const insertAt = endOfOwnContent(lines, block, config.level);
	if (insertAt >= lines.length) {
		return appendAtEndOfFile(lines, newLine, content);
	}

	return joinLines([...lines.slice(0, insertAt), newLine, ...lines.slice(insertAt)], content);
}

/**
 * Index at which the configured heading's own content ends: the line
 * before the first deeper (sub)heading inside the block, or the end of the
 * block when the section has no subheadings.
 */
function endOfOwnContent(lines: string[], block: LineRange, level: number): number {
	for (let i = block.start + 1; i <= block.end && i < lines.length; i++) {
		const heading = headingLevel(lines[i]);
		if (heading !== null && heading > level) return i;
	}
	return block.end + 1;
}

function appendAtEndOfFile(lines: string[], newLine: string, content: string): string {
	if (lines.length > 0 && lines[lines.length - 1] === "") {
		return joinLines([...lines.slice(0, -1), newLine, ""], content);
	}
	return joinLines([...lines, newLine], content);
}




