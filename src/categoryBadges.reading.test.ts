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
import { normalizeHeadingText, parseDailyNote } from "./parser";
import type { CustomCategory } from "./settings";
import type { EventHeadingConfig } from "./parser";

const CATEGORIES: CustomCategory[] = [
	{ name: "Work", displayName: "Work", color: "#d0e1fd" },
	{ name: "Study", displayName: "Study", color: "#ebd3f8" },
	{ name: "Rest", displayName: "Rest", color: "#d1f2e5" },
	{ name: "Reading", displayName: "Reading", color: "#fdecd0" },
	{ name: "Exercise", displayName: "Exercise", color: "#e2e5e9" },
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
function process(
	el: HTMLElement,
	eventHeading: EventHeadingConfig = DEFAULT_CONFIG,
	sourcePath = "2026-10-16.md",
	dailyNoteFolder = "",
	dateFormat = "YYYY-MM-DD"
): void {
	processCategoryBadgesInReadingView(
		el,
		{ sourcePath } as never,
		CATEGORIES,
		dailyNoteFolder,
		eventHeading,
		dateFormat
	);
}

function processSection(
	el: HTMLElement,
	docId: string,
	lineStart: number,
	lineEnd: number,
	sourcePath = "Log/2026/10/22.md"
): void {
	processCategoryBadgesInReadingView(
		el,
		{
			sourcePath,
			docId,
			getSectionInfo: () => ({ text: "", lineStart, lineEnd }),
		} as never,
		CATEGORIES,
		"Log",
		DEFAULT_CONFIG,
		"YYYY/MM/DD"
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
	it("keeps Event scope across Obsidian preview sections", () => {
		const firstSection = renderEl(
			"<h1>Event</h1><ul>" +
				"<li>09:00 - 12:20 [Study]</li>" +
				"<li>12:20 - 14:30 [Exercise]</li>" +
				"</ul>"
		);
		const nextSection = renderEl(
			"<ul>" +
				"<li>14:30 - 17:40 [Work]</li>" +
				"<li>17:40 - 19:50 [Study]</li>" +
				"</ul>"
		);

		processSection(firstSection, "sectioned-note", 6, 8);
		processSection(nextSection, "rerendered-note", 9, 10);

		expect(badgeTexts(firstSection)).toEqual(["Study", "Exercise"]);
		expect(badgeTexts(nextSection)).toEqual(["Work", "Study"]);

		const editedSection = renderEl(
			"<ul>" +
				"<li>14:30 - 17:40 [Work]</li>" +
				"<li>17:40 - 19:50 [Work]</li>" +
				"</ul>"
		);
		processSection(editedSection, "edited-note-render", 9, 10);

		expect(badgeTexts(editedSection)).toEqual(["Work", "Work"]);
	});

	it("stops rendering after a same-level heading in a later section", () => {
		const eventSection = renderEl(
			"<h1>Event</h1><p>09:00 - 12:20 [Study]</p>"
		);
		const otherSection = renderEl(
			"<h1>Other</h1><p>12:20 - 14:30 [Exercise]</p>"
		);

		processSection(eventSection, "scoped-section-note", 6, 7, "Log/2026/10/23.md");
		processSection(otherSection, "scoped-section-note", 8, 9, "Log/2026/10/23.md");

		expect(badgeTexts(eventSection)).toEqual(["Study"]);
		expect(badgeCount(otherSection)).toBe(0);
	});

	it("renders every category badge in the configured daily-note list", () => {
		const el = renderEl(
			"<h1>Event</h1><ul>" +
				"<li>09:00 - 12:20 [Study]</li>" +
				"<li>12:20 - 14:30 [Exercise]</li>" +
				"<li>14:30 - 17:40 [Work]</li>" +
				"<li>17:40 - 19:50 [Study]</li>" +
				"</ul>"
		);
		process(el, DEFAULT_CONFIG, "Log/2026/10/22.md", "Log", "YYYY/MM/DD");

		expect(badgeCount(el)).toBe(4);
		expect(badgeTexts(el)).toEqual(["Study", "Exercise", "Work", "Study"]);
	});

	it("renders a badge for a category token under the configured heading", () => {
		const el = renderEl(
			"<h1>Event</h1><p>- 9:00 - 10:00 [Work] Team meeting</p>"
		);
		process(el);

		expect(badgeCount(el)).toBe(1);
		expect(badgeTexts(el)).toEqual(["Work"]);
	});

	it("renders badges in notes using the core plugin's nested date format and folder", () => {
		const el = renderEl("<h1>Event</h1><p>- 9:00 - 10:00 [Work] Team meeting</p>");
		process(el, DEFAULT_CONFIG, "Log/2026/10/16.md", "Log", "YYYY/MM/DD");

		expect(badgeCount(el)).toBe(1);
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

	it("matches a heading whose text is rendered from inline markup", () => {
		// Obsidian renders `# **Event**` as `<h1><strong>Event</strong></h1>`.
		// The heading's visible text is "Event", so the renderer must scope
		// to it exactly as the parser does.
		const el = renderEl(
			"<h1><strong>Event</strong></h1><p>- 9:00 - 10:00 [Work] inside</p>" +
				"<h1>Other</h1><p>- 11:00 - 12:00 [Rest] outside</p>"
		);
		process(el);

		expect(badgeCount(el)).toBe(1);
		expect(badgeTexts(el)).toEqual(["Work"]);
	});

	it("matches a heading whose text is rendered from a link", () => {
		// Obsidian renders `# [Event](url)` as a link whose visible text is
		// "Event", so the renderer opens the section on it — and the parser
		// must agree, or the note would show badges inside an Event section
		// the parser never opened.
		const el = renderEl(
			'<h1><a href="https://example.com">Event</a></h1><p>- 9:00 - 10:00 [Work] inside</p>' +
				"<h1>Other</h1><p>- 11:00 - 12:00 [Rest] outside</p>"
		);
		process(el);

		expect(badgeCount(el)).toBe(1);
		expect(badgeTexts(el)).toEqual(["Work"]);
	});

	it("does NOT render a badge when the configured heading is an image", () => {
		// Obsidian renders `# ![Event](y.png)` as `<h1><img alt="Event" src="y.png"></h1>`.
		// The alt text lives in an ATTRIBUTE, so the heading's textContent is
		// the empty string — the section is not opened here, and the parser
		// must agree (it must not read the alt text as the heading text).
		const el = renderEl(
			'<h1><img alt="Event" src="y.png"></h1><p>- 9:00 - 10:00 [Work] inside</p>' +
				"<h1>Other</h1><p>- 11:00 - 12:00 [Rest] outside</p>"
		);
		process(el);

		expect(badgeCount(el)).toBe(0);
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

describe("parser / DOM agreement", () => {
	it("normalizes an image heading to the same text the DOM exposes", () => {
		// The parser must read a heading exactly as the renderer exposes it.
		// An image renders as an <img> element whose textContent is the
		// EMPTY string, so the parser must normalize `![Event](y.png)` to
		// "" — not to its alt text. Substituting the alt text made the
		// parser open an Event section the reading view never opened.
		const el = renderEl('<h1><img alt="Event" src="y.png"></h1>');
		const domText = el.querySelector("h1")?.textContent ?? "";

		expect(normalizeHeadingText("![Event](y.png)")).toBe(domText);
		expect(normalizeHeadingText("![Event](y.png)")).toBe("");
	});

	it("normalizes a link heading to the same text the DOM exposes", () => {
		// A link's label IS its rendered text, so the two sides agree here.
		const el = renderEl('<h1><a href="https://example.com">Event</a></h1>');
		const domText = el.querySelector("h1")?.textContent ?? "";

		expect(normalizeHeadingText("[Event](https://example.com)")).toBe(domText);
		expect(normalizeHeadingText("[Event](https://example.com)")).toBe("Event");
	});

	it("agrees with the parser about a fenced block inside the Event section", () => {
		// The parser treats a fence as a boundary: a `#` inside it is code,
		// not a heading, so it cannot close the Event section. The reading
		// view renders the fence as <pre><code>, so there is no heading
		// element there either — the two sides must agree on how many
		// category tokens belong to the section.
		const source = [
			"# Event",
			"- 09:00 - 10:00 [Work] a",
			"```",
			"# config",
			"- 12:00 - 13:00 [Work] not-an-event",
			"```",
			"- 10:00 - 11:00 [Rest] b",
		].join("\n");

		const parsed = parseDailyNote(source);
		expect(parsed.timeline).toHaveLength(2);

		// The rendered DOM of the same note: the fence becomes <pre><code>.
		const el = renderEl(
			"<h1>Event</h1>" +
				"<p>- 09:00 - 10:00 [Work] a</p>" +
				"<pre><code># config\n- 12:00 - 13:00 [Work] not-an-event</code></pre>" +
				"<p>- 10:00 - 11:00 [Rest] b</p>"
		);
		process(el);

		// Two parsed events, and two badge tokens in the DOM — the token
		// inside the code block is NOT one of them.
		expect(parsed.timeline.filter((item) => item.category !== undefined)).toHaveLength(2);
		expect(badgeCount(el)).toBe(2);
		expect(badgeTexts(el)).toEqual(["Work", "Rest"]);
	});

	it("does not render a badge for a category token inside a code block", () => {
		// A token inside a fence is code, so it stays literal text — the
		// same boundary the parser applies.
		const el = renderEl(
			"<h1>Event</h1>" +
				"<pre><code>- 09:00 - 10:00 [Work] inside-a-fence</code></pre>" +
				"<p>- 10:00 - 11:00 [Rest] b</p>"
		);
		process(el);

		expect(badgeCount(el)).toBe(1);
		expect(badgeTexts(el)).toEqual(["Rest"]);
	});

	it("does not let a heading inside a code block close the Event section", () => {
		// `<pre><code>` content is never a heading element, so the section
		// stays open — mirroring the parser's fence-aware boundary.
		const el = renderEl(
			"<h1>Event</h1>" +
				"<pre><code># Other</code></pre>" +
				"<p>- 10:00 - 11:00 [Rest] still inside</p>"
		);
		process(el);

		expect(badgeCount(el)).toBe(1);
		expect(badgeTexts(el)).toEqual(["Rest"]);
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
