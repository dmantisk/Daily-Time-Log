import { describe, expect, it } from "vitest";
import {
	appendLineToBlock,
	DEFAULT_EVENT_HEADING,
	findEventBlock,
	isTopLevelOrMarker,
	matchMarker,
	parseDailyNote,
	parseTimeline,
	removeLineRangeAt,
	replaceLineAt,
	replaceLineRangeAt,
	stripFrontmatter,
	stripHtml,
	timelineLineMatches,
	timelineRangeMatches,
	TIME_VALUE_REGEX,
	timeToMinutes,
	minutesToTime,
	timelineDurationMinutes,
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

	it("finds the configured block and ends it at the next heading", () => {
		const lines = ["# Intro", "before", "## Activity", "- 09:00 - 10:00 work", "### nested", "- 10:00 - 11:00 ignored"];
		expect(findEventBlock(lines, 0, { text: "Activity", level: 2 })).toEqual({ start: 2, end: 3 });
	});

	it("does not recognize any heading other than the configured one", () => {
		// Only the configured heading opens the Event block — there is no
		// hard-coded fallback list of historical spellings. When the heading
		// does not match, NO block is opened, so the whole-note fallback scan
		// picks up event lines from every section.
		const content = "# _이벤트\n- 9:00 - 10:00 회의\n# Other\n- 10:00 - 11:00 later";
		const result = parseDailyNote(content, { text: "Activity", level: 2 });
		expect(result.timeline.map((item) => item.description)).toEqual(["회의", "later"]);
	});

	it("opens a block (and stops at the next heading) only for the configured heading", () => {
		// The configured heading ends the block at the next heading, so the
		// event line under "# Other" is excluded.
		const content = "## Activity\n- 9:00 - 10:00 working\n# Other\n- 10:00 - 11:00 ignored";
		const result = parseDailyNote(content, { text: "Activity", level: 2 });
		expect(result.timeline.map((item) => item.description)).toEqual(["working"]);
	});

	it("does not recognize the configured text at a different heading level", () => {
		const content = "# Event\n- 9:00 - 10:00 work\n# Other\n- 10:00 - 11:00 later";
		// Configured at level 2, so the H1 "# Event" is not a match — no block
		// is opened and the whole-body fallback finds both event lines.
		expect(parseDailyNote(content, { text: "Event", level: 2 }).timeline).toHaveLength(2);

		// At the configured level, the block is opened and ends at "# Other".
		const level2 = "## Event\n- 9:00 - 10:00 work\n# Other\n- 10:00 - 11:00 later";
		expect(parseDailyNote(level2, { text: "Event", level: 2 }).timeline).toHaveLength(1);
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

	it("falls back to scanning the body when no Event heading exists", () => {
		const result = parseDailyNote("- 09:00 - 10:00 work\n- [ ] task");
		expect(result.timeline).toHaveLength(1);
		expect(result).not.toHaveProperty("todos");
	});

	it("preserves original line indexes when frontmatter precedes the Event block", () => {
		const result = parseDailyNote("---\ntags: [work]\n---\n# Event\n- 09:00 - 10:00 work");
		expect(result.timeline[0].line).toBe(4);
	});

	it("does not treat a non-configured heading as the Event block", () => {
		// A note whose heading doesn't match the configuration falls back to
		// whole-note scanning, so its event lines are still found.
		const result = parseDailyNote("# Event\n- 09:00 - 10:00 work", { text: "Activity", level: 2 });
		expect(result.timeline).toHaveLength(1);
		expect(result.timeline[0].description).toBe("work");
	});
});
describe("appendLineToBlock", () => {
	it("inserts before the next heading in the configured Event block", () => {
		const content = "# Intro\n## Activity\n- 9:00 - 10:00 work\n### Notes\nother";
		expect(appendLineToBlock(content, "- 10:00 - 11:00 study", { text: "Activity", level: 2 })).toBe(
			"# Intro\n## Activity\n- 9:00 - 10:00 work\n- 10:00 - 11:00 study\n### Notes\nother"
		);
	});

	it("appends to EOF when no Event block is present and preserves a trailing newline", () => {
		expect(appendLineToBlock("# Notes\n", "- 9:00 - 10:00 work")).toBe("# Notes\n- 9:00 - 10:00 work\n");
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

	it("validates strict time input", () => {
		expect(TIME_VALUE_REGEX.test("09:00")).toBe(true);
		expect(TIME_VALUE_REGEX.test("24:00")).toBe(false);
		expect(TIME_VALUE_REGEX.test("9:60")).toBe(false);
	});
});

describe("stripHtml", () => {
	it("removes tags and decodes common entities", () => {
		expect(stripHtml("<strong>Work</strong> &amp; rest")).toBe("Work & rest");
	});

	it("leaves plain text untouched", () => {
		expect(stripHtml("plain text")).toBe("plain text");
	});
});
