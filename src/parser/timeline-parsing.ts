import { type EventHeadingConfig, DEFAULT_EVENT_HEADING, headingLevel } from "./heading-normalization";

import {
	type LineRange,
	FenceTracker,
	findEventBlock,
	joinLines,
	splitContentLines,
	stripFrontmatter,
	stripTrailingCarriageReturn,
} from "./event-block";

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

/**
 * Exported so callers (e.g. view.ts) can re-validate a line before mutating it in place.
 * Group 3 (category) is optional — AGENTS-reference.md: `- HH:mm - HH:mm [Category] description`.
 * Lines written before the category feature existed have no `[...]` token at all and still
 * match, with group 3 `undefined` (see parseTimeline / timelineLineMatches).
 */
export const TIME_RANGE_REGEX = /^[-*]\s*(\d{1,2}:\d{2})\s*[-~]\s*(\d{1,2}:\d{2})\s*(?:\[([^[\]]*)\]\s*)?(.*)$/;
const CHECKBOX_REGEX = /^[-*]\s*\[([ xX])\]\s*(.*)$/;

/**
 * Finds `[Category]` tokens that follow a time-range-shaped sequence.
 *
 * This expression is deliberately not anchored to the beginning of a line:
 * category badges are visual decoration, not event parsing. This allows
 * category references in continuation prose inside the configured Event
 * section to receive the same styling as event-line categories. It does not
 * create additional timeline items: `parseTimeline()` independently starts
 * items only from complete lines matching `TIME_RANGE_REGEX` at line start.
 * The badge renderers separately limit decoration to configured daily notes
 * and the configured Event section.
 *
 * Matches the time range as part of the pattern instead of using lookbehind,
 * so it works on older iOS JavaScript engines. Group 1 = the category text
 * inside the brackets.
 */
export const CATEGORY_BADGE_REGEX_SOURCE =
	"\\d{1,2}:\\d{2}\\s*[-~]\\s*\\d{1,2}:\\d{2}\\s*\\[(?![ xX]\\])([^\\x00-\\x1F\\[\\]\\r\\n]+?)\\](?!\\])";

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

		if (headingLevel(text) !== null) {
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
export function parseDailyNote(content: string, config: EventHeadingConfig = DEFAULT_EVENT_HEADING): ParsedDailyNote {
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
	//
	// Heading detection uses the shared headingLevel() which implements
	// CommonMark's 0-3 leading spaces rule.
	return TIME_RANGE_REGEX.test(line) || CHECKBOX_REGEX.test(line.trim()) || headingLevel(line) !== null;
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
export interface AppendedTimelineLine {
	/** Updated Markdown content, preserving the note's original line endings. */
	content: string;
	/** Zero-based physical line index where `newLine` begins. */
	line: number;
}

/**
 * Appends a Timeline line and returns its exact insertion position.
 *
 * This is the position-aware counterpart to `appendLineToBlock()`. It lets
 * callers hand the cursor to Obsidian's editor without trying to rediscover
 * an insertion point from the updated note (which is ambiguous when entries
 * have identical text or the Event block contains nested headings).
 */
export function appendLineToBlockWithPosition(
	content: string,
	newLine: string,
	config: EventHeadingConfig = DEFAULT_EVENT_HEADING
): AppendedTimelineLine {
	const { lines, bodyStart } = stripFrontmatter(content);
	const block = findEventBlock(lines, bodyStart, config);

	if (!block) {
		const heading = `${"#".repeat(config.level)} ${config.text}`;
		const base = lines.length > 0 && lines[lines.length - 1] === "" ? lines.slice(0, -1) : lines;
		return {
			content: joinLines([...base, heading, newLine, ""], content),
			line: base.length + 1,
		};
	}

	const insertAt = endOfOwnContent(lines, block, config.level);
	if (insertAt >= lines.length) {
		const line = lines.length > 0 && lines[lines.length - 1] === "" ? lines.length - 1 : lines.length;
		return { content: appendAtEndOfFile(lines, newLine, content), line };
	}

	return {
		content: joinLines([...lines.slice(0, insertAt), newLine, ...lines.slice(insertAt)], content),
		line: insertAt,
	};
}

/** Existing string-only API retained for callers that do not need cursor placement. */
export function appendLineToBlock(
	content: string,
	newLine: string,
	config: EventHeadingConfig = DEFAULT_EVENT_HEADING
): string {
	return appendLineToBlockWithPosition(content, newLine, config).content;
}

/**
 * Index at which the configured heading's own content ends: the line
 * before the first deeper (sub)heading inside the block, or the end of the
 * block when the section has no subheadings.
 *
 * Fenced code blocks are skipped: a heading inside a fence is CODE, not a
 * heading, so it must not be treated as an insertion boundary.
 */
function endOfOwnContent(lines: string[], block: LineRange, level: number): number {
	const fence = new FenceTracker();
	for (let i = block.start + 1; i <= block.end && i < lines.length; i++) {
		// Feed every line to the fence tracker. If the line is part of a
		// fenced code block (opening fence, content, or closing fence),
		// skip heading detection for that line.
		if (fence.consume(lines[i])) {
			continue;
		}
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
