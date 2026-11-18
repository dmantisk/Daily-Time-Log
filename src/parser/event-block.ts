import {
	headingLevel,
	matchMarker,
	normalizeHeadingText,
	normalizeRenderedHeadingText,
	DEFAULT_EVENT_HEADING,
} from "./heading-normalization";
import type { EventHeadingConfig, HeadingInfo } from "./heading-normalization";

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
export function findEventBlock(lines: string[], bodyStart: number, config: EventHeadingConfig): LineRange | null {
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
 * True when `content` contains an Event block for the configured heading.
 * Used by the sidebar to tell the user their note is missing the heading
 * instead of silently showing an empty timeline.
 */
export function hasEventBlock(content: string, config: EventHeadingConfig = DEFAULT_EVENT_HEADING): boolean {
	return findEventBlockInContent(content, config) !== null;
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
			heading.level === config.level && normalizeRenderedHeadingText(heading.text).toLowerCase() === wanted
	);
	if (start === -1) return false;

	// It closes at the next heading at the same level or above.
	for (let i = start + 1; i < headings.length; i++) {
		if (headings[i].level <= config.level) return false;
	}

	return true;
}

export interface LineRange {
	/** 0-based, inclusive */
	start: number;
	/** 0-based, inclusive */
	end: number;
}

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
export class FenceTracker {
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
export function isOpeningFence(line: string, match: RegExpExecArray): boolean {
	if (match[1][0] === "`" && line.slice(match[0].length).includes("`")) {
		return false;
	}
	return true;
}

/**
 * Matches an opening or closing code fence: three or more backticks, or
 * three or more tildes. CommonMark allows a fence to be indented by up to
 * three spaces, which the leading ` {0,3}` covers.
 */
export const CODE_FENCE_REGEX = /^ {0,3}(`{3,}|~{3,})/;

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
 * Strips a trailing CRLF `\r` only — NOT a general whitespace trim.
 */
export function stripTrailingCarriageReturn(line: string): string {
	return line.endsWith("\r") ? line.slice(0, -1) : line;
}

/**
 * The line ending a file uses: `"\r\n"` if it contains one, otherwise `"\n"`.
 *
 * The write path must re-join lines with the ending the file already uses —
 * otherwise editing one line in a CRLF note converts just that line to LF and
 * the file ends up with mixed line endings.
 */
export function detectLineEnding(content: string): string {
	return content.includes("\r\n") ? "\r\n" : "\n";
}

/**
 * Re-joins `lines` with the line ending the original `content` used, so a
 * write never changes the file's line-ending style.
 */
export function joinLines(lines: string[], content: string): string {
	return lines.join(detectLineEnding(content));
}

export const FRONTMATTER_DELIMITER = "---";
