/**
 * Daily note filename <-> Date helpers.
 * Kept separate from parser.ts (which only parses existing content) since
 * this module is about daily note identity, not parsing.
 */

const DAILY_NOTE_BASENAME_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

export function formatDateBasename(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

export function formatDateFilename(date: Date): string {
	return `${formatDateBasename(date)}.md`;
}

export function parseDateFromBasename(basename: string): Date | null {
	const match = DAILY_NOTE_BASENAME_REGEX.exec(basename);
	if (!match) return null;

	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const date = new Date(year, month - 1, day);

	// `Date` silently rolls invalid month/day values over into a neighboring
	// date (e.g. 2026-02-31 -> 2026-03-03) instead of signaling an error.
	// Reject anything that didn't round-trip so a malformed filename is
	// treated as "not a daily note", not as some other, unrelated date.
	if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
		return null;
	}

	return date;
}

export function isSameDate(a: Date, b: Date): boolean {
	return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * True when a file name identifies it as a daily note: a Markdown file
 * whose basename is a valid `YYYY-MM-DD` date.
 *
 * The extension check matters because the plugin READS and WRITES these
 * files (adding, editing, and deleting Events all call `vault.modify`).
 * Without it, a date-named non-Markdown file — e.g. an image or a CSV
 * exported as `2026-10-16.png` — would be treated as a daily note and
 * overwritten with Markdown text.
 *
 * Takes the file name WITH its extension (`2026-10-16.md`).
 */
export function isDailyNoteFileName(fileName: string): boolean {
	const extensionIndex = fileName.lastIndexOf(".");
	if (extensionIndex === -1) return false;
	if (fileName.slice(extensionIndex + 1).toLowerCase() !== "md") return false;
	return parseDateFromBasename(fileName.slice(0, extensionIndex)) !== null;
}

/**
 * Checks whether a vault-relative file path is located inside the configured
 * `dailyNoteFolder`. An empty or whitespace-only folder setting allows files
 * anywhere in the vault.
 */
export function isInDailyNoteFolder(filePath: string, dailyNoteFolder: string): boolean {
	const folder = dailyNoteFolder.trim().replace(/^\/+|\/+$/g, "");
	if (!folder) return true;
	return filePath === folder || filePath.startsWith(`${folder}/`);
}
