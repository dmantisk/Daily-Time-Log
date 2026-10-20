/**
 * @vitest-environment happy-dom
 *
 * Reading-view category badge rendering.
 *
 * These tests drive the REAL `processCategoryBadgesInReadingView()` against
 * a real DOM, because the bug they guard against was a mismatch between a
 * `TreeWalker`'s filter and the kind of node it was compared against —
 * a class of defect that only a DOM-level test can catch.
 *
 * The rendered DOM mimics what Obsidian's reading view produces: Markdown
 * headings become `<h1>`–`<h6>` elements in document order, and paragraph
 * text becomes text nodes inside `<p>` elements.
 */

import { describe, expect, it } from "vitest";
import { processCategoryBadgesInReadingView } from "./categoryBadges";
import type { CustomCategory } from "./settings";
import type { EventHeadingConfig } from "./parser";

const CATEGORIES: CustomCategory[] = [
	{ name: "Work", displayName: "Work", color: "#d0e1fd" },
	{ name: "Rest", displayName: "Rest", color: "#d1f2e5" },
];

const DEFAULT_CONFIG: EventHeadingConfig = { text: "Event", level: 1 };

/**
 * Builds a reading-view-like DOM from a minimal HTML string.
 * `el` is what Obsidian hands to the post-processor.
 */
function renderEl(html: string): HTMLElement {
	const el = document.createElement("div");
	el.innerHTML = html;
	return el;
}

/**
 * Runs the reading-view post-processor over `el` for a daily note named
 * `2026-10-16.md` at the vault root.
 */
function process(el: HTMLElement, eventHeading: EventHeadingConfig = DEFAULT_CONFIG): void {
	processCategoryBadgesInReadingView(
		el,
		{ sourcePath: "2026-10-16.md" } as never,
		CATEGORIES,
		"",
		eventHeading
	);
}

/** Number of rendered badge spans in `el`. */
function badgeCount(el: HTMLElement): number {
	return el.querySelectorAll("span.dwl-cat-badge").length;
}

/** The text of every rendered badge span in `el`. */
function badgeTexts(el: HTMLElement): string[] {
	return Array.from(el.querySelectorAll("span.dwl-cat-badge")).map((s) => s.textContent ?? "");
}

describe("processCategoryBadgesInReadingView — Event section scoping", () => {
	it("renders a badge for a category token under the configured heading", () => {
		const el = renderEl(
			"<h1>Event</h1><p>- 9:00 - 10:00 [Work] Team meeting</p>"
		);
		process(el);

		expect(badgeCount(el)).toBe(1);
		expect(badgeTexts(el)).toEqual(["Work"]);
	});

	it("renders a badge for a token under a deeper (sub)heading of the Event section", () => {
		const el = renderEl(
			"<h1>Event</h1><h2>Detail</h2><p>- 9:00 - 10:00 [Work] nested</p>"
		);
		process(el);

		expect(badgeCount(el)).toBe(1);
		expect(badgeTexts(el)).toEqual(["Work"]);
	});

	it("does NOT render a badge for a token after a same-level heading", () => {
		// The Event section ends at the next heading of the same level, so
		// the second paragraph is outside it.
		const el = renderEl(
			"<h1>Event</h1><p>- 9:00 - 10:00 [Work] inside</p>" +
				"<h1>Other</h1><p>- 11:00 - 12:00 [Rest] outside</p>"
		);
		process(el);

		expect(badgeCount(el)).toBe(1);
		expect(badgeTexts(el)).toEqual(["Work"]);
	});

	it("does NOT render a badge for a token under a higher-level heading", () => {
		const el = renderEl(
			"<h1>Event</h1><p>- 9:00 - 10:00 [Work] inside</p>" +
				"<h2>Sub</h2><p>- 11:00 - 12:00 [Rest] still inside</p>" +
				"<h1>Other</h1><p>- 13:00 - 14:00 [Work] outside</p>"
		);
		process(el);

		expect(badgeCount(el)).toBe(2);
		expect(badgeTexts(el)).toEqual(["Work", "Rest"]);
	});

	it("scopes to the FIRST of two identical Event headings", () => {
		// The parser takes the first "# Event" block and stops at the
		// second one, so the badge renderer must do the same: the token
		// between the two headings is inside, the one after it is not.
		const el = renderEl(
			"<h1>Event</h1><p>- 9:00 - 10:00 [Work] first block</p>" +
				"<h1>Event</h1><p>- 11:00 - 12:00 [Rest] second block</p>"
		);
		process(el);

		expect(badgeCount(el)).toBe(1);
		expect(badgeTexts(el)).toEqual(["Work"]);
	});

	it("does NOT render any badge when the configured heading is absent", () => {
		const el = renderEl("<h1>Other</h1><p>- 9:00 - 10:00 [Work] nowhere</p>");
		process(el);

		expect(badgeCount(el)).toBe(0);
	});

	it("does NOT render a badge for a token that appears BEFORE the configured heading", () => {
		// A token above the Event section is outside it. This is the
		// false-positive direction: when the scoping decision is made
		// against the whole document, a trailing "# Event" heading makes
		// every token in the note look like it is inside the section.
		const el = renderEl(
			"<h1>Other</h1><p>- 9:00 - 10:00 [Work] before</p>" +
				"<h1>Event</h1><p>- 11:00 - 12:00 [Rest] after</p>"
		);
		process(el);

		expect(badgeCount(el)).toBe(1);
		expect(badgeTexts(el)).toEqual(["Rest"]);
	});

	it("respects a non-default configured heading text and level", () => {
		const el = renderEl(
			"<h1>Intro</h1><h2>Activity</h2><p>- 9:00 - 10:00 [Work] ok</p>" +
				"<h2>Other</h2><p>- 11:00 - 12:00 [Rest] out</p>"
		);
		process(el, { text: "Activity", level: 2 });

		expect(badgeCount(el)).toBe(1);
		expect(badgeTexts(el)).toEqual(["Work"]);
	});

	it("does NOT render a badge for a token that is not in event-line position", () => {
		const el = renderEl(
			"<h1>Event</h1><p>Met with [John] for lunch</p><p>- [ ] [Work] a checkbox</p>"
		);
		process(el);

		expect(badgeCount(el)).toBe(0);
	});

	it("does NOT render a badge for an unknown category", () => {
		const el = renderEl("<h1>Event</h1><p>- 9:00 - 10:00 [Unknown] thing</p>");
		process(el);

		expect(badgeCount(el)).toBe(0);
	});
});

describe("processCategoryBadgesInReadingView — file scoping", () => {
	it("ignores files outside the configured daily-note folder", () => {
		const el = renderEl("<h1>Event</h1><p>- 9:00 - 10:00 [Work] Team meeting</p>");
		processCategoryBadgesInReadingView(
			el,
			{ sourcePath: "notes/2026-10-16.md" } as never,
			CATEGORIES,
			"daily",
			DEFAULT_CONFIG
		);

		expect(badgeCount(el)).toBe(0);
	});

	it("ignores files that are not date-named daily notes", () => {
		const el = renderEl("<h1>Event</h1><p>- 9:00 - 10:00 [Work] Team meeting</p>");
		processCategoryBadgesInReadingView(
			el,
			{ sourcePath: "meeting-notes.md" } as never,
			CATEGORIES,
			"",
			DEFAULT_CONFIG
		);

		expect(badgeCount(el)).toBe(0);
	});
});
