/**
 * Daily note filename <-> Date helpers.
 * Kept separate from parser.ts (which only parses existing content) since
 * this module is about daily note identity, not parsing.
 */

import { moment } from "obsidian";

export const DEFAULT_DAILY_NOTE_FORMAT = "YYYY-MM-DD";
// Obsidian exposes its callable Moment singleton with a namespace-shaped type.
const momentFactory = moment as unknown as typeof import("moment");

export function formatDateBasename(date: Date, dateFormat = DEFAULT_DAILY_NOTE_FORMAT): string {
	return momentFactory(date).format(dateFormat);
}

export function formatDateFilename(date: Date, dateFormat = DEFAULT_DAILY_NOTE_FORMAT): string {
	return `${formatDateBasename(date, dateFormat)}.md`;
}

export function parseDateFromBasename(
	basename: string,
	dateFormat = DEFAULT_DAILY_NOTE_FORMAT
): Date | null {
	const parsed = momentFactory(basename, dateFormat, true);
	return parsed.isValid() ? parsed.toDate() : null;
}

export function formatDailyNotePath(
	date: Date,
	dateFormat = DEFAULT_DAILY_NOTE_FORMAT,
	dailyNoteFolder = ""
): string {
	const folder = normalizeFolder(dailyNoteFolder);
	const datePath = formatDateFilename(date, dateFormat);
	return folder ? `${folder}/${datePath}` : datePath;
}

export function parseDateFromDailyNotePath(
	filePath: string,
	dateFormat = DEFAULT_DAILY_NOTE_FORMAT,
	dailyNoteFolder = ""
): Date | null {
	const extensionIndex = filePath.lastIndexOf(".");
	if (extensionIndex === -1 || filePath.slice(extensionIndex + 1).toLowerCase() !== "md") return null;

	const folder = normalizeFolder(dailyNoteFolder);
	if (!isInDailyNoteFolder(filePath, folder)) return null;

	const relativePath = folder ? filePath.slice(folder.length + 1, extensionIndex) : filePath.slice(0, extensionIndex);
	return parseDateFromBasename(relativePath, dateFormat);
}

export function isSameDate(a: Date, b: Date): boolean {
	return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * True when a file name identifies it as a daily note: a Markdown file
 * whose date path matches the supplied format.
 *
 * The extension check matters because the plugin READS and WRITES these
 * files (adding, editing, and deleting Events all call `vault.modify`).
 * Without it, a date-named non-Markdown file — e.g. an image or a CSV
 * exported as `2026-10-16.png` — would be treated as a daily note and
 * overwritten with Markdown text.
 *
 * Takes the file name WITH its extension (`2026-10-16.md`).
 */
export function isDailyNoteFileName(
	fileName: string,
	dateFormat = DEFAULT_DAILY_NOTE_FORMAT
): boolean {
	const extensionIndex = fileName.lastIndexOf(".");
	if (extensionIndex === -1) return false;
	if (fileName.slice(extensionIndex + 1).toLowerCase() !== "md") return false;
	return parseDateFromBasename(fileName.slice(0, extensionIndex), dateFormat) !== null;
}

/**
 * Checks whether a vault-relative file path is located inside the configured
 * `dailyNoteFolder`. An empty or whitespace-only folder setting allows files
 * anywhere in the vault.
 */
export function isInDailyNoteFolder(filePath: string, dailyNoteFolder?: string): boolean {
	const folder = normalizeFolder(dailyNoteFolder ?? "");
	if (!folder) return true;
	return filePath === folder || filePath.startsWith(`${folder}/`);
}

function normalizeFolder(folder: string): string {
	return folder.trim().replace(/^\/+|\/+$/g, "");
}
