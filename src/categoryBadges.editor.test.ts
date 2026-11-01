/**
 * @vitest-environment happy-dom
 */

import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { editorInfoField } from "obsidian";
import { buildCategoryBadgeEditorPlugin, buildTimeRangeEditorPlugin } from "./categoryBadges";
import type { CustomCategory } from "./settings";
import { installObsidianDomHelpers } from "./test/obsidian-dom-mock";

installObsidianDomHelpers();

const CATEGORIES: CustomCategory[] = [
	{ name: "Work", displayName: "Work", color: "#d0e1fd" },
];

describe("category badge editor plugin", () => {
	it("badges configured categories and leaves unknown tags as plain text", () => {
		const doc = [
			"## Time Sheet",
			"- 09:00-10:00 [Work] text",
			"- 10:00-11:00 13:00-14:00 [Work] two ranges",
			"- 14:00-15:00 [tag] unknown",
		].join("\n");
		const state = EditorState.create({
			doc,
			extensions: [
				editorInfoField.init(() => ({
					file: { path: "Log/2026/10/22.md" },
				})),
				buildCategoryBadgeEditorPlugin(
					CATEGORIES,
					"Log",
					{ text: "Time Sheet", level: 2 },
					"YYYY/MM/DD"
				),
			],
		});
		const view = new EditorView({ state, parent: document.createElement("div") });

		try {
			expect(view.dom.querySelectorAll(".dwl-cat-badge")).toHaveLength(2);
			expect(view.dom.textContent).toContain("[tag]");
		} finally {
			view.destroy();
		}
	});

	it("reveals the raw category text when the cursor enters a badge", () => {
		const doc = "## Time Sheet\n- 09:00-10:00 [Work] text";
		const state = EditorState.create({
			doc,
			extensions: [
				editorInfoField.init(() => ({
					file: { path: "Log/2026/10/22.md" },
				})),
				buildCategoryBadgeEditorPlugin(
					CATEGORIES,
					"Log",
					{ text: "Time Sheet", level: 2 },
					"YYYY/MM/DD"
				),
			],
		});
		const view = new EditorView({ state, parent: document.createElement("div") });

		try {
			expect(view.dom.querySelector(".dwl-cat-badge")).not.toBeNull();
			view.dispatch({ selection: { anchor: doc.indexOf("[Work]") + 2 } });
			expect(view.dom.querySelector(".dwl-cat-badge")).toBeNull();
			expect(view.dom.textContent).toContain("[Work]");
		} finally {
			view.destroy();
		}
	});

	it("updates the Event block range when events are appended", () => {
		const state = EditorState.create({
			doc: "## Time Sheet\n- 09:00 - 12:20 [Work]\n- 12:20 - 14:30 [Work]",
			extensions: [
				editorInfoField.init(() => ({
					file: { path: "Log/2026/10/22.md" },
				})),
				buildCategoryBadgeEditorPlugin(
					CATEGORIES,
					"Log",
					{ text: "Time Sheet", level: 2 },
					"YYYY/MM/DD"
				),
			],
		});
		const view = new EditorView({ state, parent: document.createElement("div") });

		try {
			expect(view.dom.querySelectorAll(".dwl-cat-badge")).toHaveLength(2);

			view.dispatch({
				changes: {
					from: view.state.doc.length,
					insert: "\n- 14:30 - 17:40 [Work]",
				},
			});

			expect(view.dom.querySelectorAll(".dwl-cat-badge")).toHaveLength(3);
		} finally {
			view.destroy();
		}
	});
});

describe("time range editor plugin", () => {
	it("decorates time ranges in the Event block with .dwl-time-range", () => {
		const state = EditorState.create({
			doc: "## Time Sheet\n- 09:00 - 12:20 [Work] Task A\n- 12:20 - 14:30 Lunch without category",
			extensions: [
				editorInfoField.init(() => ({
					file: { path: "Log/2026/10/22.md" },
				})),
				buildTimeRangeEditorPlugin(
					"Log",
					{ text: "Time Sheet", level: 2 },
					"YYYY/MM/DD"
				),
			],
		});
		const view = new EditorView({ state, parent: document.createElement("div") });

		try {
			const timeRanges = view.dom.querySelectorAll(".dwl-time-range");
			expect(timeRanges).toHaveLength(2);
			expect(timeRanges[0].textContent).toBe("09:00 - 12:20");
			expect(timeRanges[1].textContent).toBe("12:20 - 14:30");
		} finally {
			view.destroy();
		}
	});

	it("only decorates the event timestamp, ignoring time ranges in descriptions", () => {
		const state = EditorState.create({
			doc: "## Time Sheet\n- 09:00 - 10:30 [Work] Review call held from 11:00 - 12:00",
			extensions: [
				editorInfoField.init(() => ({
					file: { path: "Log/2026/10/22.md" },
				})),
				buildTimeRangeEditorPlugin(
					"Log",
					{ text: "Time Sheet", level: 2 },
					"YYYY/MM/DD"
				),
			],
		});
		const view = new EditorView({ state, parent: document.createElement("div") });

		try {
			const timeRanges = view.dom.querySelectorAll(".dwl-time-range");
			expect(timeRanges).toHaveLength(1);
			expect(timeRanges[0].textContent).toBe("09:00 - 10:30");
		} finally {
			view.destroy();
		}
	});

	it("does not decorate time ranges outside the Event block or in non-daily notes", () => {
		const stateOutsideSection = EditorState.create({
			doc: "## Notes\n- 09:00 - 10:30 [Work] Task\n## Time Sheet\n- 10:30 - 11:30 [Work] In section",
			extensions: [
				editorInfoField.init(() => ({
					file: { path: "Log/2026/10/22.md" },
				})),
				buildTimeRangeEditorPlugin(
					"Log",
					{ text: "Time Sheet", level: 2 },
					"YYYY/MM/DD"
				),
			],
		});
		const viewA = new EditorView({ state: stateOutsideSection, parent: document.createElement("div") });

		const stateNonDailyNote = EditorState.create({
			doc: "## Time Sheet\n- 09:00 - 10:30 [Work] Task",
			extensions: [
				editorInfoField.init(() => ({
					file: { path: "Other/RegularNote.md" },
				})),
				buildTimeRangeEditorPlugin(
					"Log",
					{ text: "Time Sheet", level: 2 },
					"YYYY/MM/DD"
				),
			],
		});
		const viewB = new EditorView({ state: stateNonDailyNote, parent: document.createElement("div") });

		try {
			expect(viewA.dom.querySelectorAll(".dwl-time-range")).toHaveLength(1);
			expect(viewA.dom.querySelector(".dwl-time-range")?.textContent).toBe("10:30 - 11:30");
			expect(viewB.dom.querySelectorAll(".dwl-time-range")).toHaveLength(0);
		} finally {
			viewA.destroy();
			viewB.destroy();
		}
	});
});
