#!/usr/bin/env node
/**
 * One-off, personal-use migration: converts daily notes written by DayTime
 * Tracker (data stored as `timeline-logs` / `timeline-todos` YAML frontmatter
 * properties) into Daily Time Log's body-text format (a single Event heading
 * followed by `- HH:mm - HH:mm [Category] notes` lines — see
 * .agents/AGENTS.md §1).
 *
 * NOT part of the shipped plugin — this is a standalone script you run once
 * per vault when switching from DayTime Tracker to Daily Time Log. Kept in the
 * repo for whenever it's needed again (yourself later, or someone else).
 *
 * Usage:
 *   node scripts/migrate-from-daytimetracker.mjs <vault-path>            # dry run (default, writes nothing)
 *   node scripts/migrate-from-daytimetracker.mjs <vault-path> --write    # actually rewrite files
 *   node scripts/migrate-from-daytimetracker.mjs <vault-path> --write --heading "Activity" --level 2
 *
 * ALWAYS run without --write first and read the output. BACK UP YOUR VAULT
 * (copy the folder, or commit it to git) before running with --write —
 * this rewrites daily notes in place and there is no undo.
 *
 * What it does, per file with `timeline-logs`/`timeline-todos` frontmatter:
 *   - timeline-logs entries  -> `- HH:mm - HH:mm [Category] notes` lines under
 *     the Event heading
 *   - `timeline-logs`/`timeline-todos` keys are removed from frontmatter;
 *     any OTHER frontmatter keys (other plugins' data) are preserved as-is
 *   - any existing body content below the frontmatter is preserved, appended
 *     after the new Event block
 *   - Only files whose basename is YYYY-MM-DD are converted — Daily Time Log
 *     only recognizes date-named files as daily notes (AGENTS.md §1.1).
 *     Anything else with leftover DayTime Tracker data is reported and
 *     skipped rather than silently guessed at.
 *
 * The Event heading MUST match the plugin's configured heading
 * (Settings -> Event heading text / level), because the parser recognizes
 * only that exact heading and level. Pass --heading/--level to match your
 * configuration; the defaults are "Event" at level 1.
 *
 * What it deliberately does NOT migrate:
 *   - `timeline-todos` entries are DROPPED, not converted. Daily Time Log no
 *     longer parses To-Do blocks — checkbox lines are ordinary note content.
 *     The `timeline-todos` key is still removed from the frontmatter so the
 *     DayTime Tracker data doesn't linger, but the checkbox lines themselves
 *     are not written into the body. Move them elsewhere first if you want
 *     to keep them.
 *   - `todoId` (Event <-> To-Do linking) — dropped along with the To-Dos.
 *   - `color` — Daily Time Log resolves a category's color from the CURRENT
 *     Settings -> Category Management list by name at render time, not from
 *     a value stored per-entry. Make sure your categories match your old
 *     DayTime Tracker category names if you want colors to carry over.
 *   - `content` (DayTime Tracker's own source comments that this field
 *     currently just duplicates the category name, not a real title) — the
 *     actual free-text description comes from `notes` instead.
 */

import fs from "fs";
import path from "path";
import { dump, load } from "js-yaml";

const DATE_BASENAME_RE = /^\d{4}-\d{2}-\d{2}$/;
const FRONTMATTER_DELIM = "---";
const DEFAULT_HEADING_TEXT = "Event";
const DEFAULT_HEADING_LEVEL = 1;

function parseArgs(argv) {
	const write = argv.includes("--write");
	const headingIndex = argv.indexOf("--heading");
	const levelIndex = argv.indexOf("--level");
	const headingText =
		headingIndex >= 0 && argv[headingIndex + 1] ? argv[headingIndex + 1].trim() : DEFAULT_HEADING_TEXT;
	const headingLevel =
		levelIndex >= 0 && argv[levelIndex + 1] ? Number(argv[levelIndex + 1]) : DEFAULT_HEADING_LEVEL;
	// The vault path is the first argument that is neither a flag nor a
	// flag's value.
	const flagValues = new Set();
	if (headingIndex >= 0) flagValues.add(headingIndex + 1);
	if (levelIndex >= 0) flagValues.add(levelIndex + 1);
	const vaultPath = argv.find((a, i) => !a.startsWith("--") && !flagValues.has(i));
	return { vaultPath, write, headingText, headingLevel };
}

function stripFrontmatter(content) {
	// Strip a leading UTF-8 BOM if present — e.g. files saved by some Windows
	// editors (PowerShell's `Set-Content -Encoding utf8`, some Notepad
	// versions) include one, even though Obsidian itself doesn't. Without
	// this, such a file's first line would be "﻿---" instead of "---",
	// so it would silently fail the check below and get skipped as "nothing
	// to migrate" instead of being converted — a silent-skip we specifically
	// don't want in a script that irreversibly rewrites the user's notes.
	if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);

	const lines = content.split("\n");
	if ((lines[0] ?? "").trimEnd() !== FRONTMATTER_DELIM) return null;
	for (let i = 1; i < lines.length; i++) {
		if (lines[i].trimEnd() === FRONTMATTER_DELIM) {
			return {
				frontmatterText: lines.slice(1, i).join("\n"),
				bodyText: lines.slice(i + 1).join("\n"),
			};
		}
	}
	return null;
}

function timeToMinutes(hhmm) {
	const [h, m] = String(hhmm).split(":").map(Number);
	return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function formatEventLine(entry) {
	const category = typeof entry.category === "string" && entry.category.trim() ? `[${entry.category.trim()}] ` : "";
	const desc = typeof entry.notes === "string" ? entry.notes.trim() : "";
	return `- ${entry.start} - ${entry.end} ${category}${desc}`.trimEnd();
}

/** Returns null if there's nothing to migrate in this file, or { newContent, logCount, todoCount } / { error }. */
function convertFile(raw, headingText, headingLevel) {
	const fm = stripFrontmatter(raw);
	if (!fm) return null;

	let data;
	try {
		data = load(fm.frontmatterText) ?? {};
	} catch (err) {
		return { error: `YAML parse error: ${err.message}` };
	}
	if (typeof data !== "object" || data === null) return null;

	const rawLogs = Array.isArray(data["timeline-logs"]) ? data["timeline-logs"] : [];
	const rawTodos = Array.isArray(data["timeline-todos"]) ? data["timeline-todos"] : [];

	const logs = rawLogs.filter(
		(l) => l && typeof l === "object" && l.type === "daytime-tracker" && typeof l.start === "string" && typeof l.end === "string"
	);
	const todos = rawTodos.filter((t) => t && typeof t === "object" && typeof t.content === "string" && typeof t.checked === "boolean");

	if (logs.length === 0 && todos.length === 0) return null;

	logs.sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));

	// The parser recognizes ONLY the configured heading (text AND level), so
	// the migration must write exactly that. To-Do items are dropped — the
	// plugin no longer parses a To-Do block.
	const heading = `${"#".repeat(headingLevel)} ${headingText}`;
	const newSections = [heading, "", ...logs.map(formatEventLine), ""];

	// Keep every OTHER frontmatter key (other plugins' data) untouched — only
	// our two keys are consumed by this migration.
	const remainingFm = { ...data };
	delete remainingFm["timeline-logs"];
	delete remainingFm["timeline-todos"];
	const hasRemainingFm = Object.keys(remainingFm).length > 0;

	const existingBody = fm.bodyText.replace(/^\n+/, "");

	const parts = [];
	if (hasRemainingFm) {
		parts.push(FRONTMATTER_DELIM, dump(remainingFm).trimEnd(), FRONTMATTER_DELIM, "");
	}
	parts.push(...newSections);
	if (existingBody.trim().length > 0) {
		parts.push(existingBody);
	}

	const newContent = `${parts.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
	return { newContent, logCount: logs.length, todoCount: todos.length };
}

function walkMarkdownFiles(dir, out = []) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.name.startsWith(".")) continue; // skip .obsidian, .git, etc.
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			walkMarkdownFiles(full, out);
		} else if (entry.isFile() && entry.name.endsWith(".md")) {
			out.push(full);
		}
	}
	return out;
}

function main() {
	const { vaultPath, write, headingText, headingLevel } = parseArgs(process.argv.slice(2));
	if (!vaultPath) {
		console.error("Usage: node scripts/migrate-from-daytimetracker.mjs <vault-path> [--write] [--heading <text>] [--level <1-6>]");
		console.error("  Without --write: dry run, prints what WOULD change, writes nothing.");
		console.error("  With --write: actually rewrites files. Back up your vault first.");
		console.error("  --heading/--level: the Event heading to write. Must match the plugin's");
		console.error("    Settings -> Event heading text/level, since the parser recognizes only that.");
		process.exit(1);
	}
	if (!fs.existsSync(vaultPath) || !fs.statSync(vaultPath).isDirectory()) {
		console.error(`Not a directory: ${vaultPath}`);
		process.exit(1);
	}
	if (!Number.isInteger(headingLevel) || headingLevel < 1 || headingLevel > 6) {
		console.error(`Invalid heading level: ${headingLevel} (must be an integer 1-6).`);
		process.exit(1);
	}
	if (!headingText) {
		console.error("Heading text must not be empty.");
		process.exit(1);
	}

	console.log(`Event heading: ${"#".repeat(headingLevel)} ${headingText}`);
	console.log("");

	const files = walkMarkdownFiles(vaultPath);
	let converted = 0;
	let totalLogs = 0;
	let totalTodos = 0;
	let skippedNonDaily = 0;
	let errors = 0;

	for (const file of files) {
		const basename = path.basename(file, ".md");
		const raw = fs.readFileSync(file, "utf8");
		const result = convertFile(raw, headingText, headingLevel);
		if (!result) continue;

		if (result.error) {
			console.error(`[ERROR] ${file}: ${result.error}`);
			errors++;
			continue;
		}

		if (!DATE_BASENAME_RE.test(basename)) {
			console.warn(`[SKIP] ${file}: has DayTime Tracker data but isn't named YYYY-MM-DD — skipping.`);
			skippedNonDaily++;
			continue;
		}

		converted++;
		totalLogs += result.logCount;
		totalTodos += result.todoCount;

		if (write) {
			fs.writeFileSync(file, result.newContent, "utf8");
			console.log(`[WRITTEN] ${file} (${result.logCount} events, ${result.todoCount} todos dropped)`);
		} else {
			console.log(`[DRY-RUN] ${file} would be converted (${result.logCount} events, ${result.todoCount} todos dropped)`);
		}
	}

	console.log("");
	console.log(`Done. ${converted} file(s) ${write ? "converted" : "would be converted"}, ${totalLogs} event(s) migrated.`);
	if (totalTodos > 0) {
		console.log(
			`${totalTodos} todo(s) were DROPPED — Daily Time Log no longer parses To-Do blocks. ` +
				`The 'timeline-todos' frontmatter key was removed anyway. Recover them from your backup if you need them.`
		);
	}
	if (skippedNonDaily) console.log(`${skippedNonDaily} file(s) skipped (DayTime Tracker data present, but filename isn't YYYY-MM-DD).`);
	if (errors) console.log(`${errors} file(s) had errors — see above, nothing was written for them.`);
	if (!write) console.log("\nThis was a DRY RUN — nothing was written. Back up your vault, then re-run with --write.");
}

main();
