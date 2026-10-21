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
 * with this text starts the block; the block ends at the next heading at
 * the same level or above.
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
 * The same validation for an END time, which may additionally be `24:00`
 * (midnight at the end of the day).
 *
 * The sidebar's grid can end at midnight: with the end hour set to 24,
 * dragging the last cell produces `24:00`. The settings screen explicitly
 * advertises midnight support, and the grid labels that row `12 AM`, so
 * `24:00` is the intended representation of that end time — it must not
 * be rejected on save.
 *
 * `24:00` is accepted for END times only. As a START time it would mean
 * midnight at the beginning of the day, which has no place on the grid
 * (a start of 24:00 is indistinguishable from the end of the day) and
 * could never be rendered.
 */
export const TIME_END_VALUE_REGEX = /^(?:(?:[01]?\d|2[0-3]):[0-5]\d|24:00)$/;

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

/**
 * Normalizes a Markdown heading's TEXT to the form the renderer produces.
 *
 * The reading view renders the heading's inline markup, so `# **Event**`
 * becomes `<h1>Event</h1>` and the badge renderer sees the plain text
 * `Event`. The raw file still contains the `**` markers. Comparing the raw
 * text against the configured heading would therefore disagree with the
 * DOM, so the raw text is normalized to its rendered form:
 *
 * - Inline links are replaced by their label text (`[Event](url)` -> `Event`),
 *   because a link's label IS its rendered text.
 * - Inline images are removed ENTIRELY (`![Event](url)` -> ``), because an
 *   image renders as an `<img>` element whose `textContent` is the empty
 *   string — the alt text is an attribute, not rendered text.
 * - Inline emphasis / strong / strikethrough markers are removed
 *   (`**Event**` -> `Event`, `_Event_` -> `Event`, `~~Event~~` -> `Event`).
 * - Inline code spans are unwrapped (`` `Event` `` -> `Event`), but their
 *   CONTENTS are left alone: a code span renders literally, so
 *   `` `**Event**` `` shows as `**Event**` and must not be stripped.
 * - ATX closing sequences are dropped (`# Event #` -> `Event`).
 * - Entities are decoded (`&amp;` -> `&`).
 * - Surrounding whitespace is trimmed and internal whitespace is collapsed.
 *
 * Emphasis is only stripped when it is unambiguous, following CommonMark's
 * intraword rule: `_` never starts or ends emphasis inside a word, so
 * `foo_bar_baz` is left alone. Anything this function does not understand
 * simply stays as-is — and therefore does not match, which is the same
 * behaviour as an undecorated heading that does not match.
 *
 * NOTE: apply this to RAW heading text only. Text that has already been
 * rendered by the Markdown renderer must only be whitespace-normalized
 * (see `normalizeRenderedHeadingText`), otherwise markers that are part of
 * the visible text would be stripped a second time.
 */
export function normalizeHeadingText(text: string): string {
	const withoutClosing = text.replace(/\s+#+\s*$/, "");

	// Inline code renders its contents literally, so the markup rules
	// below must not reach inside a code span. The text is split into code
	// and non-code parts; only the non-code parts are transformed, and the
	// code contents are put back as they are.
	const parts = splitOnCodeSpans(withoutClosing);
	const rendered = parts
		.map((part) => (part.isCode ? part.text : stripInlineMarkup(part.text)))
		.join("");

	return decodeEntities(rendered).replace(/\s+/g, " ").trim();
}

/** A piece of a heading's raw text, either an inline code span or plain text. */
interface HeadingPart {
	text: string;
	/** True when the text came from an inline code span. */
	isCode: boolean;
}

/**
 * Splits raw heading text into inline-code and plain-text parts.
 *
 * A code span is a run of backticks, its content, and a run of the same
 * number of backticks — the content may itself contain backticks as long
 * as they do not close the span.
 */
function splitOnCodeSpans(text: string): HeadingPart[] {
	const parts: HeadingPart[] = [];
	const codeSpan = /(`+)([\s\S]*?)\1/g;

	let index = 0;
	let match: RegExpExecArray | null;
	while ((match = codeSpan.exec(text)) !== null) {
		if (match.index > index) {
			parts.push({ text: text.slice(index, match.index), isCode: false });
		}
		parts.push({ text: match[2], isCode: true });
		index = match.index + match[0].length;
	}
	if (index < text.length) {
		parts.push({ text: text.slice(index), isCode: false });
	}

	return parts;
}

/**
 * Removes the inline markup that the Markdown renderer turns into plain
 * text: link and image syntax, emphasis, strong, and strikethrough.
 *
 * Applied only to the non-code parts of a heading.
 */
function stripInlineMarkup(text: string): string {
	// An image renders as an <img> element, whose textContent is the EMPTY
	// string — the alt text lives in an attribute, not in rendered text. So
	// the image markup is removed entirely rather than substituted with its
	// alt text. A link, by contrast, renders as an <a> element whose label
	// IS its text, so a link keeps its label.
	//
	// A destination may contain balanced parentheses.
	const withoutImages = text
		.replace(/!\[[^\]]*\]\((?:[^()]|\([^()]*\))*\)/g, "")
		.replace(/!\[[^\]]*\]\[[^\]]*\]/g, "");
	const withoutLinks = withoutImages
		.replace(/\[([^\]]*)\]\((?:[^()]|\([^()]*\))*\)/g, "$1")
		.replace(/\[([^\]]*)\]\[[^\]]*\]/g, "$1");

	const withoutStrong = withoutLinks.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "$1");
	const withoutEmphasis = withoutStrong
		.replace(/(^|\s)\*(?=\S)([\s\S]*?\S)\*(?=\s|$)/g, "$1$2")
		.replace(/(^|\s)_(?=\S)([\s\S]*?\S)_(?=\s|$)/g, "$1$2");
	const withoutStrike = withoutEmphasis.replace(/~~(?=\S)([\s\S]*?\S)~~/g, "$1");

	return withoutStrike;
}

/**
 * Normalizes heading text that the Markdown renderer has ALREADY produced
 * (e.g. the `textContent` of a rendered `<h1>`).
 *
 * Only whitespace is normalized: the markup has already been rendered away,
 * so stripping emphasis again would corrupt headings whose visible text
 * legitimately contains `*` or `_`.
 */
export function normalizeRenderedHeadingText(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

/**
 * Decodes the HTML entities Obsidian's Markdown renderer decodes when it
 * renders a heading.
 */
function decodeEntities(text: string): string {
	return text
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, "&");
}

/**
 * True when `line` is the configured event marker heading — exactly
 * `level` `#` characters followed by `text` (case-insensitive, trimmed).
 *
 * The heading TEXT is normalized with `normalizeHeadingText` before the
 * comparison, so decorated headings (`# **Event**`, `# Event #`) match the
 * same way the rendered DOM sees them. The configured text is normalized
 * the same way, so a setting of `Event` matches a heading written as
 * `**Event**`.
 *
 * ONLY the configured heading is recognized. There is no hard-coded
 * fallback list of historical spellings — if the user changes the Event
 * heading in Settings, notes using the old heading stop being treated as
 * an Event block and yield no events at all.
 */
export function matchMarker(line: string, config: EventHeadingConfig): boolean {
	const trimmed = line.trim();
	if (!Number.isInteger(config.level) || config.level < 1 || config.level > 6 || !config.text.trim()) return false;

	const headingRegex = new RegExp(`^#{${config.level}}\\s+(.*?)\\s*$`, "i");
	const match = headingRegex.exec(trimmed);
	if (!match) return false;

	const headingText = normalizeHeadingText(match[1]);
	const wanted = normalizeHeadingText(config.text);
	return headingText.toLowerCase() === wanted.toLowerCase();
}

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
 * original file (AGENTS.md 1.2).
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
 * Returns the heading level (1-6) of `line`, or null if it isn't a heading.
 */
export function headingLevel(line: string): number | null {
	const match = /^(#{1,6})\s/.exec(line.trim());
	return match ? match[1].length : null;
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

	for (let i = bodyStart; i < lines.length; i++) {
		const line = lines[i];

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
	return TIME_RANGE_REGEX.test(line) || CHECKBOX_REGEX.test(line) || /^#{1,6}\s/.test(line.trim());
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
 * Duration of a Timeline/Event item in minutes. If `end` is BEFORE
 * `start`, the range is treated as crossing midnight (e.g. 23:00-01:00).
 * Shared by the Timeline component (bar height) and the Dashboard's
 * "total recorded time" aggregate so the two never drift apart.
 *
 * A range whose end EQUALS its start (`09:00 - 09:00`) is a zero-length
 * range and counts as 0 minutes — it is NOT an overnight range. The
 * overnight branch is `end < start`; with `end <= start` a zero-length
 * range counted as a full day (1440 minutes), while `timelineDaySegments`
 * correctly drew no segment for it, so the grid showed nothing and the
 * dashboard reported 24 hours of recorded time.
 */
export function timelineDurationMinutes(item: Pick<TimelineItem, "start" | "end">): number {
	const startMinutes = timeToMinutes(item.start);
	const endMinutes = timeToMinutes(item.end);
	return Math.max(endMinutes - startMinutes + (endMinutes < startMinutes ? MINUTES_PER_DAY : 0), 0);
}

/**
 * The in-day segments an Event occupies, in minutes since midnight.
 *
 * A range whose end is not after its start crosses midnight (e.g.
 * `23:00 - 01:00`), so it occupies TWO segments: `23:00` to midnight and
 * midnight to `01:00`. A range ending exactly at `24:00` is a single
 * segment that runs to the end of the day.
 *
 * The grid renders one bar per segment, so an overnight Event is drawn
 * as a bar in the evening hours AND a bar in the early-morning hours.
 * Without this, comparing the raw start and end values made
 * `Math.max(start, hourStart) < Math.min(end, hourEnd)` false for every
 * hour, so an overnight Event was invisible on the grid even though the
 * dashboard counted its time.
 */
export function timelineDaySegments(item: Pick<TimelineItem, "start" | "end">): LineRange[] {
	const startMinutes = timeToMinutes(item.start);
	const endMinutes = timeToMinutes(item.end);

	if (endMinutes > startMinutes) {
		return [{ start: startMinutes, end: endMinutes }];
	}
	if (endMinutes === startMinutes) {
		// A zero-length range has no segment to draw.
		return [];
	}
	// Crosses midnight: the tail of the evening, then the head of the day.
	return [
		{ start: startMinutes, end: MINUTES_PER_DAY },
		{ start: 0, end: endMinutes },
	];
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
 * Numeric HTML entities, e.g. `&#39;` or `&#x27;`.
 *
 * The digit class is written as `\\d` inside a regular string (not a
 * regex literal), so it needs the doubled backslash to reach the
 * RegExp constructor as `\d`. Written as a single backslash it would
 * match a LITERAL backslash followed by `d`, and no numeric entity would
 * ever be decoded.
 */
const NUMERIC_ENTITY_REGEX = /&#(x[0-9a-fA-F]+|\d+);/g;

/**
 * Strips HTML tags (e.g. from notes edited with a rich-text/formatting
 * plugin like Obsidian's Editing Toolbar) for **display purposes only** —
 * callers must never write the stripped result back to the note file, only
 * use it where raw note text is rendered in the sidebar. The
 * source of truth in the file keeps its original HTML untouched.
 */
export function stripHtml(text: string): string {
	const withoutTags = text.replace(/<[^>]*>/g, "");

	const withNamedEntities = withoutTags.replace(
		/&[a-zA-Z]+;/g,
		(entity) => HTML_ENTITIES[entity] ?? entity
	);

	return withNamedEntities.replace(NUMERIC_ENTITY_REGEX, (entity, code: string) => {
		const isHex = code.startsWith("x") || code.startsWith("X");
		const value = Number.parseInt(isHex ? code.slice(1) : code, isHex ? 16 : 10);
		if (!Number.isFinite(value) || value < 0 || value > 0x10ffff) return entity;
		try {
			return String.fromCodePoint(value);
		} catch {
			return entity;
		}
	});
}