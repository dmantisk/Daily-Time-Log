import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The release guard (`.github/scripts/extract-changelog.mjs`).
 *
 * The Release workflow reads the version straight from `manifest.json` and
 * uses this script to pull the matching notes out of README.md, failing the
 * release when the README's latest changelog entry names a different
 * version. That guard is the last thing standing between a stale README
 * and a release with the wrong notes, so it is tested here.
 */

const SCRIPT_PATH = path.resolve(import.meta.dirname, "../.github/scripts/extract-changelog.mjs");

/** A README whose newest changelog entry is the given heading. */
function readmeWith(heading: string): string {
	return [
		"# Test",
		"",
		"## Changelog",
		"",
		`### ${heading}`,
		"",
		"- A note.",
		"",
	].join("\n");
}

interface RunResult {
	status: number;
	stdout: string;
}

/** Runs the guard against a README with the given heading. */
function runGuard(expectedVersion: string, heading: string): RunResult {
	const dir = mkdtempSync(path.join(tmpdir(), "dwl-changelog-"));
	try {
		const readmePath = path.join(dir, "README.md");
		const outPath = path.join(dir, "changelog.txt");
		writeFileSync(readmePath, readmeWith(heading), "utf8");

		try {
			const stdout = execFileSync(
				process.execPath,
				[SCRIPT_PATH, expectedVersion, readmePath, outPath],
				{ encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
			);
			return { status: 0, stdout };
		} catch (error) {
			const err = error as { status?: number; stdout?: string };
			return { status: err.status ?? 1, stdout: err.stdout ?? "" };
		}
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

describe("extract-changelog release guard", () => {
	it("accepts a changelog entry for the expected version", () => {
		const result = runGuard("0.5.1", "0.5.1 (2026-10-20)");
		expect(result.status).toBe(0);
		expect(result.stdout).toContain("Extracted changelog for 0.5.1");
	});

	it("rejects a changelog entry for a different version", () => {
		const result = runGuard("0.5.2", "0.5.1 (2026-10-20)");
		expect(result.status).not.toBe(0);
	});

	it("rejects a LONGER version that merely starts with the expected one", () => {
		// With a prefix match, a "0.5.10" entry would pass the guard for a
		// release of "0.5.1", and the release notes would describe the
		// wrong version.
		const result = runGuard("0.5.1", "0.5.10 (2026-10-20)");
		expect(result.status).not.toBe(0);
	});

	it("rejects a SHORTER version that the expected one starts with", () => {
		const result = runGuard("0.5.10", "0.5.1 (2026-10-20)");
		expect(result.status).not.toBe(0);
	});
});
