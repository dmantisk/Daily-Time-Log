/**
 * @vitest-environment happy-dom
 *
 * The Add/Edit Timeline Entry modal.
 *
 * The modal is built from Obsidian's own components, so what matters here
 * is that the *rules* survived the DOM rewrite:
 *
 * - the time format is still validated, and the end time still accepts
 *   `24:00` while the start time does not;
 * - a description left untouched keeps its original raw markup, so a
 *   plugin that wrote `<font>`/`<b>` tags does not lose them;
 * - consecutive blank lines are still capped at one;
 * - a continuation line that looks like a real event is still rejected.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { installObsidianDomHelpers } from "../test/obsidian-dom-mock";

installObsidianDomHelpers();

import { Notice } from "obsidian";
import { TimelineModal, type EventEntryValues } from "./TimelineModal";
import type { TimelineItem } from "../parser";
import type { CustomCategory } from "../settings";

const CATEGORIES: CustomCategory[] = [
	{ name: "Work", displayName: "Work", color: "#d0e1fd" },
	{ name: "Study", displayName: "Study", color: "#ebd3f8" },
];

/** The notices raised while the modal was open, newest last. */
beforeEach(() => {
	Notice.reset();
});

/** The modal's rendered body, so a test can reach the real controls. */
function bodyOf(modal: TimelineModal): HTMLElement {
	return modal.contentEl.querySelector(".dwl-modal-body") as HTMLElement;
}

/** The `<input>` elements of the time row, in order: start, then end. */
function timeInputsOf(modal: TimelineModal): HTMLInputElement[] {
	return [...bodyOf(modal).querySelectorAll<HTMLInputElement>(".dwl-modal-time-input")];
}

/** The description `<textarea>`. */
function textareaOf(modal: TimelineModal): HTMLTextAreaElement {
	return bodyOf(modal).querySelector("textarea") as HTMLTextAreaElement;
}

/** The buttons of the modal's action row, in order. */
function buttonsOf(modal: TimelineModal): HTMLButtonElement[] {
	return [...modal.contentEl.querySelectorAll<HTMLButtonElement>(".modal-button-container button")];
}

/** The button carrying the given label. */
function buttonLabelled(modal: TimelineModal, label: string): HTMLButtonElement {
	const match = buttonsOf(modal).find((btn) => btn.textContent === label);
	if (!match) throw new Error(`No button labelled "${label}"`);
	return match;
}

/** Builds a timeline item to edit. */
function item(overrides: Partial<TimelineItem> = {}): TimelineItem {
	return {
		line: 3,
		lineCount: 1,
		start: "09:00",
		end: "10:00",
		description: "did a thing",
		...overrides,
	};
}

/**
 * Opens a modal and returns it together with the values it saved.
 */
function openModal(
	initial: TimelineItem | null,
	onDelete: (() => void) | null = null
): { modal: TimelineModal; saved: EventEntryValues[] } {
	const saved: EventEntryValues[] = [];
	const modal = new TimelineModal(
		{} as never,
		"en",
		CATEGORIES,
		initial,
		"09:00",
		"10:00",
		(values) => saved.push(values),
		onDelete
	);
	modal.open();
	return { modal, saved };
}

describe("TimelineModal", () => {
	it("builds its body from Obsidian's own components", () => {
		const { modal } = openModal(null);

		// Two time inputs, one textarea — all created by Obsidian's
		// `TextComponent` / `TextAreaComponent`, so they are plain
		// `<input type="text">` / `<textarea>` elements.
		const inputs = timeInputsOf(modal);
		expect(inputs).toHaveLength(2);
		expect(inputs[0].type).toBe("text");
		expect(textareaOf(modal).tagName).toBe("TEXTAREA");

		// The action row is Obsidian's own `.modal-button-container`.
		const buttons = buttonsOf(modal);
		expect(buttons.map((b) => b.textContent)).toEqual(["Cancel", "Save"]);
		expect(buttons[1].classList.contains("mod-cta")).toBe(true);
	});

	it("offers the delete button only when editing", () => {
		const { modal: adding } = openModal(null);
		expect(buttonsOf(adding).map((b) => b.textContent)).toEqual(["Cancel", "Save"]);

		const { modal: editing } = openModal(item(), () => {});
		const labels = buttonsOf(editing).map((b) => b.textContent);
		expect(labels).toEqual(["Delete", "Cancel", "Save"]);

		// The delete button is destructive AND secondary — `mod-secondary`
		// is what pushes it to the far left of the row.
		const del = buttonLabelled(editing, "Delete");
		expect(del.classList.contains("mod-destructive")).toBe(true);
		expect(del.classList.contains("mod-secondary")).toBe(true);
	});

	it("rejects an invalid time and keeps the modal open", () => {
		const { modal, saved } = openModal(null);
		timeInputsOf(modal)[0].value = "9am";

		buttonLabelled(modal, "Save").click();

		expect(saved).toHaveLength(0);
		expect(Notice.shown).toHaveLength(1);
		expect(Notice.shown[0]).toContain("09:00");
	});

	it("accepts 24:00 as an end time but not as a start time", () => {
		const { modal, saved } = openModal(null);
		const [start, end] = timeInputsOf(modal);
		start.value = "09:00";
		end.value = "24:00";

		buttonLabelled(modal, "Save").click();

		expect(saved).toHaveLength(1);
		expect(saved[0].end).toBe("24:00");
	});

	it("restores the original markup when the description was not touched", () => {
		const raw = '<font color="#ff0000">red</font> text';
		const { modal, saved } = openModal(item({ description: raw }));

		// The textarea shows the stripped form for readability...
		expect(textareaOf(modal).value).toBe("red text");

		buttonLabelled(modal, "Save").click();

		// ...but saving without touching it writes the ORIGINAL markup
		// back, so a plugin's formatting is not silently deleted.
		expect(saved[0].description).toBe(raw);
	});

	it("keeps the edited text when the description WAS touched", () => {
		const raw = "<b>bold</b> text";
		const { modal, saved } = openModal(item({ description: raw }));
		// Editing the field to something that differs from the stripped
		// form means the user's text wins — the raw markup is NOT restored.
		textareaOf(modal).value = "bold text!";
		expect(textareaOf(modal).value).not.toBe(raw);

		buttonLabelled(modal, "Save").click();

		expect(saved[0].description).toBe("bold text!");
	});

	it("caps consecutive blank lines at one", () => {
		const { modal, saved } = openModal(null);
		textareaOf(modal).value = "first\n\n\n\n\nsecond";

		buttonLabelled(modal, "Save").click();

		expect(saved[0].description).toBe("first\n\nsecond");
	});

	it("rejects a continuation line that looks like another event", () => {
		const { modal, saved } = openModal(null);
		textareaOf(modal).value = "first\n- 10:00 - 11:00 another event";

		buttonLabelled(modal, "Save").click();

		expect(saved).toHaveLength(0);
		expect(Notice.shown).toHaveLength(1);
	});

	it("saves the picked category and toggles it off when clicked again", () => {
		const { modal, saved } = openModal(null);

		/** The chips currently in the DOM — they are re-rendered on click. */
		const chips = (): HTMLButtonElement[] => [
			...bodyOf(modal).querySelectorAll<HTMLButtonElement>(".dwl-category-chip"),
		];

		expect(chips().map((c) => c.textContent)).toEqual(["Work", "Study"]);

		chips()[0].click();
		expect(chips()[0].classList.contains("mod-cta")).toBe(true);

		buttonLabelled(modal, "Save").click();
		expect(saved[0].category).toBe("Work");

		// Clicking the selected chip again clears the category, so the
		// entry can be taken back to "uncategorized".
		const { modal: second, saved: secondSaved } = openModal(null);
		const secondChips = (): HTMLButtonElement[] => [
			...bodyOf(second).querySelectorAll<HTMLButtonElement>(".dwl-category-chip"),
		];
		secondChips()[1].click();
		expect(secondChips()[1].classList.contains("mod-cta")).toBe(true);
		secondChips()[1].click();
		expect(secondChips()[1].classList.contains("mod-cta")).toBe(false);

		buttonLabelled(second, "Save").click();
		expect(secondSaved[0].category).toBeUndefined();
	});

	it("asks for the delete and closes when the delete button is pressed", () => {
		const deleted = vi.fn();
		const { modal } = openModal(item(), deleted);

		buttonLabelled(modal, "Delete").click();

		expect(deleted).toHaveBeenCalledTimes(1);
	});
});
