import { describe, expect, it } from "vitest";
import { CATEGORY_BADGE_REGEX_SOURCE } from "./parser";

describe("CATEGORY_BADGE_REGEX_SOURCE", () => {
	const regex = () => new RegExp(CATEGORY_BADGE_REGEX_SOURCE, "g");

	it("matches standard English category tokens", () => {
		const text = "- 09:00 - 10:30 [Work] Team meeting";
		const matches = Array.from(text.matchAll(regex()));
		expect(matches.length).toBe(1);
		expect(matches[0][1]).toBe("Work");
		expect(matches[0][0]).toBe("09:00 - 10:30 [Work]");
	});

	it("does not use unsupported regular-expression lookbehind", () => {
		expect(CATEGORY_BADGE_REGEX_SOURCE).not.toContain("(?<=");
		expect(CATEGORY_BADGE_REGEX_SOURCE).not.toContain("(?<!");
	});

	it("matches category tokens with spaces and hyphens", () => {
		const text = "- 11:00 - 12:00 [Deep-Work Focus] Project";
		const matches = Array.from(text.matchAll(regex()));
		expect(matches.length).toBe(1);
		expect(matches[0][1]).toBe("Deep-Work Focus");
	});

	it("matches Korean category tokens", () => {
		const text = "- 14:00 - 15:30 [업무] 회의 준비";
		const matches = Array.from(text.matchAll(regex()));
		expect(matches.length).toBe(1);
		expect(matches[0][1]).toBe("업무");
	});

	it("does not match wikilinks", () => {
		const text = "See [[Work]] and [[2026-10-16]] notes";
		const matches = Array.from(text.matchAll(regex()));
		expect(matches.length).toBe(0);
	});

	it("does not match markdown checkboxes", () => {
		const text = "- [ ] Task one\n- [x] Task two\n- [X] Task three";
		const matches = Array.from(text.matchAll(regex()));
		expect(matches.length).toBe(0);
	});

	it("does not match category badge on a checkbox line", () => {
		// Not preceded by a time range → not an event line
		const text = "- [ ] [Work] Follow up with client";
		const matches = Array.from(text.matchAll(regex()));
		expect(matches.length).toBe(0);
	});

	it("matches category badge when directly after a time range", () => {
		const text = "- 09:00 - 10:30 [Work] Team meeting";
		const matches = Array.from(text.matchAll(regex()));
		expect(matches.length).toBe(1);
		expect(matches[0][1]).toBe("Work");
	});

	it("matches category badge with `~` time separator", () => {
		const text = "- 14:00 ~ 15:30 [Reading] Book club";
		const matches = Array.from(text.matchAll(regex()));
		expect(matches.length).toBe(1);
		expect(matches[0][1]).toBe("Reading");
	});

	it("matches Korean category badge directly after a time range", () => {
		const text = "- 14:00 - 15:30 [업무] 회의 준비";
		const matches = Array.from(text.matchAll(regex()));
		expect(matches.length).toBe(1);
		expect(matches[0][1]).toBe("업무");
	});

	it("does not match brackets in prose/diary text", () => {
		const text = "Met with [John] for lunch";
		const matches = Array.from(text.matchAll(regex()));
		expect(matches.length).toBe(0);
	});

	it("does not match brackets in headings", () => {
		const text = "# Notes about [Work]";
		const matches = Array.from(text.matchAll(regex()));
		expect(matches.length).toBe(0);
	});

	it("does not match wikilinks after a time range", () => {
		const text = "- 09:00 - 10:30 [[Work]] Team meeting";
		const matches = Array.from(text.matchAll(regex()));
		expect(matches.length).toBe(0);
	});
});
