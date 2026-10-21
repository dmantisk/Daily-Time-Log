import { describe, expect, it } from "vitest";
import {
	appendLineToBlock,
	DEFAULT_EVENT_HEADING,
	findEventBlock,
	findEventBlockInContent,
	hasEventBlock,
	isTopLevelOrMarker,
	isWithinEventHeading,
	matchMarker,
	normalizeHeadingText,
	parseDailyNote,
	parseTimeline,
	removeLineRangeAt,
	replaceLineAt,
	replaceLineRangeAt,
	stripFrontmatter,
	stripHtml,
	timelineLineMatches,
	timelineRangeMatches,
	TIME_END_VALUE_REGEX,
	TIME_VALUE_REGEX,
	timeToMinutes,
	minutesToTime,
	timelineDaySegments,
	timelineDurationMinutes,
	type HeadingInfo,
} from "./parser";

describe("stripFrontmatter", () => {
	it("returns bodyStart 0 when there is no frontmatter", () => {
		expect(stripFrontmatter("# Event\n- 9:00 - 10:00 work").bodyStart).toBe(0);
	});

	it("skips a closed YAML frontmatter block", () => {
		const result = stripFrontmatter("---\ntags: [work]\n---\n# Event");
		expect(result.bodyStart).toBe(3);
		expect(result.lines[result.bodyStart]).toBe("# Event");
	});

	it("does not treat an unterminated or whitespace-padded delimiter as frontmatter", () => {
		expect(stripFrontmatter("---\n# Event").bodyStart).toBe(0);
		expect(stripFrontmatter(" --- \n---\n# Event").bodyStart).toBe(0);
	});

	it("recognizes delimiters in CRLF files", () => {
		expect(stripFrontmatter("---\r\ntags: [work]\r\n---\r\n# Event").bodyStart).toBe(3);
	});
});

describe("Event heading matching", () => {
	it("matches the configured heading level and escaped text, case-insensitively", () => {
		expect(matchMarker("  ## Project [Log]  ", { text: "Project [Log]", level: 2 })).toBe(true);
		expect(matchMarker("## project [log]", { text: "Project [Log]", level: 2 })).toBe(true);
		expect(matchMarker("# Project [Log]", { text: "Project [Log]", level: 2 })).toBe(false);
	});

	it("rejects invalid levels and empty labels", () => {
		expect(matchMarker("# Event", { text: "Event", level: 0 })).toBe(false);
		expect(matchMarker("# Event", { text: " ", level: 1 })).toBe(false);
	});

	it("matches decorated headings, because the rendered DOM shows them undecorated", () => {
		// The reading view renders `# **Event**` as `<h1>Event</h1>`, so the
		// parser must accept the decorated form too — otherwise the parser
		// and the badge renderer disagree about the same file.
		expect(matchMarker("# **Event**", { text: "Event", level: 1 })).toBe(true);
		expect(matchMarker("# *Event*", { text: "Event", level: 1 })).toBe(true);
		expect(matchMarker("# _Event_", { text: "Event", level: 1 })).toBe(true);
		expect(matchMarker("# ~~Event~~", { text: "Event", level: 1 })).toBe(true);
		expect(matchMarker("# `Event`", { text: "Event", level: 1 })).toBe(true);
		expect(matchMarker("# Event #", { text: "Event", level: 1 })).toBe(true);
		expect(matchMarker("## **Event** ##", { text: "Event", level: 2 })).toBe(true);
	});

	it("matches a configured heading that is itself decorated", () => {
		expect(matchMarker("# Event", { text: "**Event**", level: 1 })).toBe(true);
	});

	it("matches a heading whose text is a Markdown link", () => {
		// The reading view renders `[Event](url)` as a link with the visible
		// text "Event", so the badge renderer sees "Event" and opens the
		// section. The parser must agree, or the note would show badges
		// inside an Event section the parser never opened.
		expect(matchMarker("# [Event](https://example.com)", { text: "Event", level: 1 })).toBe(true);
		expect(matchMarker("# [Event](/wiki/note)", { text: "Event", level: 1 })).toBe(true);
		expect(matchMarker("# [Event][ref]", { text: "Event", level: 1 })).toBe(true);
		expect(matchMarker("# [**Event**](https://example.com)", { text: "Event", level: 1 })).toBe(true);
		expect(matchMarker("# [Event](https://example.com)", { text: "Other", level: 1 })).toBe(false);
	});

	it("leaves the contents of an inline code span alone", () => {
		// A code span renders literally, so `` `**Event**` `` shows as
		// `**Event**` in the DOM — the markers are part of the visible text
		// and must not be stripped.
		expect(normalizeHeadingText("`**Event**`")).toBe("**Event**");
		expect(normalizeHeadingText("`Event`")).toBe("Event");
	});

	it("strips an image heading entirely, matching the DOM's empty textContent", () => {
		// An image renders as an <img> element, whose textContent is the
		// EMPTY string — the alt text is an attribute, not rendered text.
		// Substituting the alt text made the parser read `![Event](y.png)`
		// as the heading "Event" and open an Event section the reading
		// view never opened (and vice versa on the badge side).
		expect(normalizeHeadingText("![Event](y.png)")).toBe("");
		expect(normalizeHeadingText("![Event][ref]")).toBe("");
		expect(normalizeHeadingText("![Event](y.png) trailing text")).toBe("trailing text");
		expect(normalizeHeadingText("![a](1.png) ![b](2.png)")).toBe("");
	});

	it("does NOT match a heading that is only an image", () => {
		// The parser and the DOM must agree: the DOM sees an empty heading
		// text, so the section is not opened there either.
		expect(matchMarker("# ![Event](y.png)", { text: "Event", level: 1 })).toBe(false);
		expect(matchMarker("# ![Event](y.png)", { text: "", level: 1 })).toBe(false);
	});

	it("still matches a link heading, whose label IS its rendered text", () => {
		expect(matchMarker("# [Event](https://example.com)", { text: "Event", level: 1 })).toBe(true);
	});

	it("does not treat an image inside a code span as an image", () => {
		// A code span renders literally, so the image markup stays visible
		// text and must not be stripped.
		expect(normalizeHeadingText("`![Event](y.png)`")).toBe("![Event](y.png)");
	});

	it("does not match a decorated heading with a different text", () => {
		expect(matchMarker("# **Other**", { text: "Event", level: 1 })).toBe(false);
		expect(matchMarker("# Event log", { text: "Event", level: 1 })).toBe(false);
	});

	it("does not strip emphasis markers that are part of the word", () => {
		// CommonMark's intraword rule: `_` inside a word is literal.
		expect(matchMarker("# foo_bar_baz", { text: "foo_bar_baz", level: 1 })).toBe(true);
		expect(matchMarker("# foo_bar_baz", { text: "foobarbaz", level: 1 })).toBe(false);
	});

	it("ends the block at the next heading of the same level or above", () => {
		// Configured at H2: a deeper H3 is a subheading and stays inside the
		// block; an H1 (above) ends it.
		const lines = ["# Intro", "before", "## Activity", "- 09:00 - 10:00 work", "### nested", "- 10:00 - 11:00 kept"];
		expect(findEventBlock(lines, 0, { text: "Activity", level: 2 })).toEqual({ start: 2, end: 5 });
	});

	it("keeps subheadings and their events inside the block", () => {
		const content = "## Activity\n- 9:00 - 10:00 working\n### Detail\n- 10:00 - 11:00 nested\n# Other\n- 11:00 - 12:00 excluded";
		const result = parseDailyNote(content, { text: "Activity", level: 2 });
		expect(result.timeline.map((item) => item.description)).toEqual(["working", "nested"]);
	});

	it("does not recognize any heading other than the configured one", () => {
		// Only the configured heading opens the Event block — there is no
		// hard-coded fallback list of historical spellings, and no
		// whole-body fallback either. A note without the configured heading
		// yields no events at all.
		const content = "# _이벤트\n- 9:00 - 10:00 회의\n# Other\n- 10:00 - 11:00 later";
		const result = parseDailyNote(content, { text: "Activity", level: 2 });
		expect(result.timeline).toEqual([]);
	});

	it("does not recognize the configured text at a different heading level", () => {
		const content = "# Event\n- 9:00 - 10:00 work\n# Other\n- 10:00 - 11:00 later";
		// Configured at level 2, so the H1 "# Event" is not a match — no block
		// is opened, so nothing is parsed.
		expect(parseDailyNote(content, { text: "Event", level: 2 }).timeline).toEqual([]);

		// At the configured level, the block is opened and ends at "# Other".
		const level2 = "## Event\n- 9:00 - 10:00 work\n# Other\n- 10:00 - 11:00 later";
		expect(parseDailyNote(level2, { text: "Event", level: 2 }).timeline).toHaveLength(1);
	});

	it("reports whether the note has an Event block", () => {
		expect(hasEventBlock("# Event\n- 9:00 - 10:00 work")).toBe(true);
		expect(hasEventBlock("# Other\n- 9:00 - 10:00 work")).toBe(false);
		expect(hasEventBlock("# Other\n- 9:00 - 10:00 work", { text: "Activity", level: 2 })).toBe(false);
	});
});

describe("isWithinEventHeading", () => {
	const h = (level: number, text: string): HeadingInfo => ({ level, text });

	it("is true directly under the configured heading", () => {
		expect(isWithinEventHeading([h(1, "Event")])).toBe(true);
	});

	it("is false when the heading text does not match", () => {
		expect(isWithinEventHeading([h(1, "Other")])).toBe(false);
		expect(isWithinEventHeading([h(1, "Event log")])).toBe(false);
	});

	it("is false when the heading level does not match", () => {
		expect(isWithinEventHeading([h(2, "Event")])).toBe(false);
	});

	it("matches the heading text case-insensitively and trimmed", () => {
		expect(isWithinEventHeading([h(1, "  event  ")])).toBe(true);
		expect(isWithinEventHeading([h(1, "EVENT")])).toBe(true);
	});

	it("is false with no preceding heading", () => {
		expect(isWithinEventHeading([])).toBe(false);
	});

	it("stays true under a deeper (sub)heading", () => {
		expect(isWithinEventHeading([h(1, "Event"), h(2, "Detail")])).toBe(true);
		expect(isWithinEventHeading([h(1, "Event"), h(3, "Detail")])).toBe(true);
	});

	it("is false after a heading at the same level or above", () => {
		expect(isWithinEventHeading([h(1, "Event"), h(1, "Other")])).toBe(false);
		expect(isWithinEventHeading([h(2, "Event"), h(1, "Other")])).toBe(false);
		expect(isWithinEventHeading([h(2, "Event"), h(2, "Other")])).toBe(false);
	});

	it("uses the FIRST matching heading, not the last one", () => {
		// Two "# Event" headings: the section opens at the first one and
		// closes at the second one (same level). The last heading wins would
		// wrongly include content after the second heading.
		expect(isWithinEventHeading([h(1, "Event"), h(1, "Event")])).toBe(false);
		expect(isWithinEventHeading([h(1, "Event"), h(2, "Detail"), h(1, "Event")])).toBe(false);
	});

	it("is true between a duplicate heading and the next same-level heading", () => {
		// Content directly under the FIRST of two identical headings is
		// inside the section.
		expect(isWithinEventHeading([h(1, "Event")])).toBe(true);
		expect(isWithinEventHeading([h(1, "Event"), h(2, "Detail")])).toBe(true);
	});

	it("honours a non-default configured heading and level", () => {
		const config = { text: "Activity", level: 2 };
		expect(isWithinEventHeading([h(2, "Activity")], config)).toBe(true);
		expect(isWithinEventHeading([h(1, "Activity")], config)).toBe(false);
		expect(isWithinEventHeading([h(2, "Activity"), h(3, "Detail")], config)).toBe(true);
		expect(isWithinEventHeading([h(2, "Activity"), h(1, "Top")], config)).toBe(false);
		expect(isWithinEventHeading([h(2, "Activity"), h(2, "Other")], config)).toBe(false);
	});

	it("agrees with the file-based block rule", () => {
		// The badge renderer works from rendered headings while the parser
		// works from raw lines — both must agree on what is "inside".
		const content = "# Intro\n## Event\n- 9:00 - 10:00 work\n### Detail\n- 10:00 - 11:00 nested\n# Other\n- 11:00 - 12:00 outside";
		const config = { text: "Event", level: 2 };
		const block = findEventBlockInContent(content, config);

		// Headings preceding each event line, as the DOM walk would see them.
		expect(isWithinEventHeading([h(1, "Intro"), h(2, "Event")], config)).toBe(true);
		expect(isWithinEventHeading([h(1, "Intro"), h(2, "Event"), h(3, "Detail")], config)).toBe(true);
		expect(isWithinEventHeading([h(1, "Intro"), h(2, "Event"), h(3, "Detail"), h(1, "Other")], config)).toBe(false);

		// The same boundaries as the block range: lines 1-4 are inside
		// (the `### Detail` subheading does not end it), line 5 (`# Other`)
		// ends it.
		expect(block).toEqual({ start: 1, end: 4 });
	});

	it("agrees with the file-based block rule for duplicate headings", () => {
		// Two "# Event" headings: the parser takes the FIRST block, so the
		// badge renderer must scope to the first one too.
		const content =
			"# Event\n- 9:00 - 10:00 work\n# Event\n- 11:00 - 12:00 second\n# Other\n- 13:00 - 14:00 third";
		const config = { text: "Event", level: 1 };
		const block = findEventBlockInContent(content, config);

		// The parser stops at the second "# Event" (same level).
		expect(block).toEqual({ start: 0, end: 1 });

		// The badge renderer must agree: only the first block is inside.
		expect(isWithinEventHeading([h(1, "Event")], config)).toBe(true);
		expect(isWithinEventHeading([h(1, "Event"), h(1, "Event")], config)).toBe(false);
		expect(isWithinEventHeading([h(1, "Event"), h(1, "Event"), h(1, "Other")], config)).toBe(false);
	});

	it("agrees with the file-based block rule for a decorated heading", () => {
		// `# **Event**` renders as `<h1>Event</h1>`, so the rendered heading
		// the badge renderer sees is the plain text "Event" — which is what
		// the parser must match on too.
		const content = "# **Event**\n- 9:00 - 10:00 work\n# Other\n- 11:00 - 12:00 outside";
		const config = { text: "Event", level: 1 };
		const block = findEventBlockInContent(content, config);

		expect(block).toEqual({ start: 0, end: 1 });

		// The rendered heading text (what the DOM exposes).
		expect(isWithinEventHeading([h(1, "Event")], config)).toBe(true);
		expect(isWithinEventHeading([h(1, "Event"), h(1, "Other")], config)).toBe(false);
	});

	it("normalizes a decorated configured heading the same way the parser does", () => {
		// A setting of "**Event**" describes the same rendered heading as
		// a setting of "Event", so the badge rule must accept it too.
		const config = { text: "**Event**", level: 1 };
		expect(isWithinEventHeading([h(1, "Event")], config)).toBe(true);
		expect(isWithinEventHeading([h(1, "Other")], config)).toBe(false);
	});
});

describe("parseTimeline", () => {
	it("extracts time, category, description and physical line indexes", () => {
		const items = parseTimeline(["# Event", "- 09:00 - 10:30 [업무] 회의 준비"], { start: 0, end: 1 });
		expect(items).toEqual([
			{ line: 1, lineCount: 1, start: "09:00", end: "10:30", category: "업무", description: "회의 준비" },
		]);
	});

	it("supports single-digit hours, tilde separators and uncategorized legacy lines", () => {
		const items = parseTimeline(["- 9:00~10:00 short form", "- 10:00 - 11:00 [] text"], { start: 0, end: 1 });
		expect(items[0]).toMatchObject({ start: "9:00", end: "10:00", category: undefined });
		expect(items[1]).toMatchObject({ category: undefined, description: "text" });
	});

	it("absorbs continuation text verbatim and preserves paragraph breaks", () => {
		const lines = ["- 10:10 - 10:40 [Work] report", " - nested detail", "", "next paragraph"];
		expect(parseTimeline(lines, { start: 0, end: 3 })[0]).toMatchObject({
			lineCount: 4,
			description: "report\n - nested detail\n\nnext paragraph",
		});
	});

	it("stops continuation absorption at a second consecutive blank line", () => {
		const lines = ["- 9:00 - 10:00 work", "detail", "", "", "unrelated"];
		expect(parseTimeline(lines, { start: 0, end: 4 })[0]).toMatchObject({ lineCount: 3, description: "work\ndetail" });
	});

	it("does not absorb headings, time-range lines, or checkboxes as continuation text", () => {
		expect(isTopLevelOrMarker("- [ ] task")).toBe(true);
		expect(isTopLevelOrMarker("# Notes")).toBe(true);
		expect(isTopLevelOrMarker("- 10:00 - 11:00 next")).toBe(true);
		expect(isTopLevelOrMarker("plain note")).toBe(false);
		expect(parseTimeline(["- 9:00 - 10:00 work", "- [ ] independent task", "note"], { start: 0, end: 2 })[0])
			.toMatchObject({ lineCount: 1, description: "work" });
	});
});

describe("parseDailyNote", () => {
	it("parses only the configured Event block and ignores subsequent sections", () => {
		const content = "# Intro\n- 8:00 - 9:00 ignored\n## Activity\n- 09:00 - 10:00 working\n# Notes\n- 10:00 - 11:00 ignored";
		expect(parseDailyNote(content, { text: "Activity", level: 2 }).timeline.map((item) => item.description)).toEqual([
			"working",
		]);
	});

	it("returns no events when no Event heading exists", () => {
		// Strict scoping: with no configured heading there is no whole-body
		// fallback, so the note contributes nothing.
		const result = parseDailyNote("- 09:00 - 10:00 work\n- [ ] task");
		expect(result.timeline).toEqual([]);
		expect(result).not.toHaveProperty("todos");
	});

	it("preserves original line indexes when frontmatter precedes the Event block", () => {
		const result = parseDailyNote("---\ntags: [work]\n---\n# Event\n- 09:00 - 10:00 work");
		expect(result.timeline[0].line).toBe(4);
	});

	it("does not treat a non-configured heading as the Event block", () => {
		// A note whose heading doesn't match the configuration has no Event
		// block, so its event lines are not parsed at all.
		const result = parseDailyNote("# Event\n- 09:00 - 10:00 work", { text: "Activity", level: 2 });
		expect(result.timeline).toEqual([]);
	});
});
describe("appendLineToBlock", () => {
	it("inserts directly under the heading, before any subheading", () => {
		const content = "# Intro\n## Activity\n- 9:00 - 10:00 work\n### Notes\nother";
		expect(appendLineToBlock(content, "- 10:00 - 11:00 study", { text: "Activity", level: 2 })).toBe(
			"# Intro\n## Activity\n- 9:00 - 10:00 work\n- 10:00 - 11:00 study\n### Notes\nother"
		);
	});

	it("appends to the end of the block when it has no subheadings", () => {
		const content = "# Intro\n## Activity\n- 9:00 - 10:00 work\n# Notes\nother";
		expect(appendLineToBlock(content, "- 10:00 - 11:00 study", { text: "Activity", level: 2 })).toBe(
			"# Intro\n## Activity\n- 9:00 - 10:00 work\n- 10:00 - 11:00 study\n# Notes\nother"
		);
	});

	it("creates the configured heading when the note has no Event block", () => {
		expect(appendLineToBlock("# Notes\n", "- 9:00 - 10:00 work")).toBe("# Notes\n# Event\n- 9:00 - 10:00 work\n");
	});

	it("supports the default Event configuration", () => {
		expect(appendLineToBlock("# Event", "- 9:00 - 10:00 work", DEFAULT_EVENT_HEADING)).toBe(
			"# Event\n- 9:00 - 10:00 work"
		);
	});
});

describe("line mutation and stale-item guards", () => {
	it("replaces and removes the requested line range", () => {
		const content = "a\nb\nc";
		expect(replaceLineAt(content, 1, "B")).toBe("a\nB\nc");
		expect(replaceLineRangeAt(content, 1, 2, "B")).toBe("a\nB");
		expect(removeLineRangeAt(content, 1, 2)).toBe("a");
	});

	it("matches timeline content including category and continuation lines", () => {
		const item = {
			line: 0,
			lineCount: 2,
			start: "9:00",
			end: "10:00",
			category: "Work",
			description: "report\nnote",
		};
		expect(timelineLineMatches("- 9:00 - 10:00 [Work] report", { ...item, lineCount: 1, description: "report" })).toBe(true);
		expect(timelineRangeMatches(["- 9:00 - 10:00 [Work] report", "note"], item)).toBe(true);
		expect(timelineRangeMatches(["- 9:00 - 10:00 [Work] report", "changed"], item)).toBe(false);
	});
});

describe("time helpers", () => {
	it("converts between time strings and minutes", () => {
		expect(timeToMinutes("9:00")).toBe(540);
		expect(minutesToTime(540)).toBe("09:00");
		expect(minutesToTime(1439)).toBe("23:59");
	});

	it("calculates durations, including overnight ranges", () => {
		expect(timelineDurationMinutes({ start: "09:00", end: "10:30" })).toBe(90);
		expect(timelineDurationMinutes({ start: "23:00", end: "01:00" })).toBe(120);
	});

	it("counts a zero-length range as zero, not as a full day", () => {
		// `09:00 - 09:00` records no time. It is not an overnight range:
		// timelineDaySegments draws no segment for it, so counting it as
		// 1440 minutes made the dashboard report 24 hours of recorded
		// time for a range the grid shows as nothing.
		expect(timelineDurationMinutes({ start: "09:00", end: "09:00" })).toBe(0);
	});

	it("validates strict time input", () => {
		expect(TIME_VALUE_REGEX.test("09:00")).toBe(true);
		expect(TIME_VALUE_REGEX.test("24:00")).toBe(false);
		expect(TIME_VALUE_REGEX.test("9:60")).toBe(false);
	});

	it("accepts 24:00 as an END time only", () => {
		// The grid produces 24:00 when the end hour is 24 (midnight at the
		// end of the day), and the end-hour setting advertises that. A
		// START of 24:00 is never valid — it has no place on the grid.
		expect(TIME_END_VALUE_REGEX.test("24:00")).toBe(true);
		expect(TIME_END_VALUE_REGEX.test("23:59")).toBe(true);
		expect(TIME_END_VALUE_REGEX.test("09:00")).toBe(true);
		expect(TIME_END_VALUE_REGEX.test("24:30")).toBe(false);
		expect(TIME_END_VALUE_REGEX.test("9:60")).toBe(false);
		expect(TIME_END_VALUE_REGEX.test("")).toBe(false);
	});

	it("measures a 24:00 end time as the end of the day", () => {
		expect(timeToMinutes("24:00")).toBe(1440);
		expect(timelineDurationMinutes({ start: "23:50", end: "24:00" })).toBe(10);
	});
});

describe("timelineDaySegments", () => {
	it("returns a single segment for a normal in-day range", () => {
		expect(timelineDaySegments({ start: "09:00", end: "10:30" })).toEqual([
			{ start: 540, end: 630 },
		]);
	});

	it("returns a single segment running to the end of the day for a 24:00 end", () => {
		expect(timelineDaySegments({ start: "23:00", end: "24:00" })).toEqual([
			{ start: 1380, end: 1440 },
		]);
	});

	it("splits an overnight range into an evening and a morning segment", () => {
		// The grid draws one bar per segment, so an overnight Event shows
		// up both in the evening hours and in the early-morning hours.
		expect(timelineDaySegments({ start: "23:00", end: "01:00" })).toEqual([
			{ start: 1380, end: 1440 },
			{ start: 0, end: 60 },
		]);
	});

	it("returns no segment for a zero-length range", () => {
		expect(timelineDaySegments({ start: "09:00", end: "09:00" })).toEqual([]);
	});
});

describe("stripHtml", () => {
	it("removes tags and decodes common entities", () => {
		expect(stripHtml("<strong>Work</strong> &amp; rest")).toBe("Work & rest");
	});

	it("leaves plain text untouched", () => {
		expect(stripHtml("plain text")).toBe("plain text");
	});

	it("decodes numeric entities", () => {
		// The digit class in the entity pattern must actually match digits
		// — written as a single backslash it matched a LITERAL backslash
		// and no numeric entity was ever decoded.
		expect(stripHtml("it&#39;s here")).toBe("it's here");
		expect(stripHtml("&#65;&#66;&#67;")).toBe("ABC");
		expect(stripHtml("&#x41;&#x42;")).toBe("AB");
		expect(stripHtml("&#128512;")).toBe("😀");
	});

	it("leaves an out-of-range or malformed numeric entity untouched", () => {
		expect(stripHtml("&#x110000;")).toBe("&#x110000;");
		expect(stripHtml("&#99999999999;")).toBe("&#99999999999;");
	});
});
