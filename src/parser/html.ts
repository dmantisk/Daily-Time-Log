export const HTML_ENTITIES: Record<string, string> = {
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
export const NUMERIC_ENTITY_REGEX = /&#(x[0-9a-fA-F]+|\d+);/g;

/**
 * Strips HTML tags (e.g. from notes edited with a rich-text/formatting
 * plugin like Obsidian's Editing Toolbar) for **display purposes only** â€”
 * callers must never write the stripped result back to the note file, only
 * use it where raw note text is rendered in the sidebar. The
 * source of truth in the file keeps its original HTML untouched.
 */
export function stripHtml(text: string): string {
	const withoutTags = text.replace(/<[^>]*>/g, "");

	const withNamedEntities = withoutTags.replace(/&[a-zA-Z]+;/g, (entity) => HTML_ENTITIES[entity] ?? entity);

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
