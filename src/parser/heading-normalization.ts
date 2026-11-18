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
 * Returns the heading level (1-6) of `line`, or null if it isn't a heading.
 */
export function headingLevel(line: string): number | null {
	const match = /^(#{1,6})\s/.exec(line.trim());
	return match ? match[1].length : null;
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

/** A piece of a heading's raw text, either an inline code span or plain text. */
interface HeadingPart {
	text: string;
	/** True when the text came from an inline code span. */
	isCode: boolean;
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

