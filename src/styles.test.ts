import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The grid block's label styling (styles.css).
 *
 * These rules are pure CSS, so a DOM test cannot observe them — happy-dom
 * does no layout and does no text measurement, so neither the truncation
 * nor the ellipsis is observable in the rendered DOM. The rule's source is
 * asserted instead, the same way `releaseGuard.test.ts` asserts a script's
 * behaviour.
 */

const css = readFileSync(fileURLToPath(new URL("../styles.css", import.meta.url)), "utf8");

/** The stylesheet with its comments removed — a comment may contain braces. */
const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * The declarations of the rule whose selector list is exactly `selector`.
 *
 * The selector list is compared EXACTLY (as a comma-separated list of
 * trimmed selectors), so a rule is only matched when it is the one asked
 * for — `.dwl-grid-block.is-short` must not be answered by
 * `.dwl-grid-block.is-short .dwl-grid-block-label`, which merely starts
 * with the same text. Returns an empty string when no such rule exists, so
 * a missing rule fails the assertion instead of throwing.
 */
function ruleBody(selector: string): string {
	const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const pattern = new RegExp(`(?:^|\\})\\s*([^{}]*${escaped}[^{}]*)\\{([^}]*)\\}`, "m");
	const match = pattern.exec(cssWithoutComments);
	if (!match) return "";

	const selectors = match[1]
		.split(",")
		.map((part) => part.trim())
		.filter((part) => part.length > 0);
	if (!selectors.includes(selector)) return "";

	return match[2];
}

describe("styles.css — grid block label", () => {
	it("cuts a SHORT bar's label cleanly, without a trailing ellipsis", () => {
		// A bar at most one 10-minute cell wide is too narrow to show the
		// whole category name. The name is cut at a fixed width, and the cut
		// is clean: the bar itself already signals that the name is
		// truncated, and an ellipsis at that size reads as part of the
		// category's name rather than as a truncation mark.
		const body = ruleBody(".dwl-grid-block.is-short .dwl-grid-block-label");

		expect(body).toMatch(/text-overflow\s*:\s*clip\b/);
		expect(body).not.toMatch(/text-overflow\s*:\s*ellipsis\b/);
	});

	it("keeps the ellipsis on a LONGER bar's label, which the bar itself clips", () => {
		// A wide bar is a box of its own, so an ellipsis there is the normal
		// "this does not fit" signal and is kept.
		const body = ruleBody(".dwl-grid-block-label");

		expect(body).toMatch(/text-overflow\s*:\s*ellipsis\b/);
	});

	it("anchors a short bar's label to the left edge", () => {
		// Centring the label in a bar narrower than the name would leave
		// only the middle of the word visible.
		const body = ruleBody(".dwl-grid-block.is-short");

		expect(body).toMatch(/justify-content\s*:\s*flex-start\b/);
		expect(body).toMatch(/overflow\s*:\s*visible\b/);
	});
});
