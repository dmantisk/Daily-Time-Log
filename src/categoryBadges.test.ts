import { describe, expect, it } from "vitest";
import { CATEGORY_BADGE_REGEX_SOURCE } from "./parser";

describe("CATEGORY_BADGE_REGEX_SOURCE", () => {
	const regex = () => new RegExp(CATEGORY_BADGE_REGEX_SOURCE, "g");

	it("matches standard English category tokens", () => {
		const text = "- 09:00 - 10:30 [Work] Team meeting";
		const matches = Array.from(text.matchAll(regex()));
		expect(matches.length).toBe(1);
		expect(matches[0][1]).toBe("Work");
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

	it("matches category badge when on same line as checkbox", () => {
		const text = "- [ ] [Work] Follow up with client";
		const matches = Array.from(text.matchAll(regex()));
		expect(matches.length).toBe(1);
		expect(matches[0][1]).toBe("Work");
	});
});
