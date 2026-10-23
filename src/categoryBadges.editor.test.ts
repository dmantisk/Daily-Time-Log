/**
 * @vitest-environment happy-dom
 */

import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { editorInfoField } from "obsidian";
import { buildCategoryBadgeEditorPlugin } from "./categoryBadges";
import type { CustomCategory } from "./settings";
import { installObsidianDomHelpers } from "./test/obsidian-dom-mock";

installObsidianDomHelpers();

const CATEGORIES: CustomCategory[] = [
	{ name: "Work", displayName: "Work", color: "#d0e1fd" },
];

describe("category badge editor plugin", () => {
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
