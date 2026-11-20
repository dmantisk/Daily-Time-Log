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

import { Notice } from "../test/obsidian-mock";
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

/** The four `<input>` elements of the time row: start hour/minute, end hour/minute. */
function timeInputsOf(modal: TimelineModal): HTMLInputElement[] {
	return [...bodyOf(modal).querySelectorAll<HTMLInputElement>(".dwl-modal-time-input")];
}

/** The description `<textarea>`. */
function textareaOf(modal: TimelineModal): HTMLTextAreaElement {
	return bodyOf(modal).querySelector("textarea") as HTMLTextAreaElement;
}

/** The category dropdown `<select>`. */
function categoryDropdownOf(modal: TimelineModal): HTMLSelectElement {
	return bodyOf(modal).querySelector("select.dwl-category-dropdown") as HTMLSelectElement;
}

/** The category dot `<span>`. */
function categoryDotOf(modal: TimelineModal): HTMLSpanElement {
	return bodyOf(modal).querySelector("span.dwl-category-dot") as HTMLSpanElement;
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
	it("auto-expands the description, then scrolls at its maximum height", () => {
		const { modal } = openModal(null);
		const textarea = textareaOf(modal);
		let scrollHeight = 120;
		Object.defineProperty(textarea, "scrollHeight", {
			configurable: true,
			get: () => scrollHeight,
		});
		const style = window.getComputedStyle(textarea);
		const borderHeight =
			(Number.parseFloat(style.borderTopWidth) || 0) +
			(Number.parseFloat(style.borderBottomWidth) || 0);

		textarea.dispatchEvent(new Event("input", { bubbles: true }));
		expect(textarea.style.height).toBe(`${120 + borderHeight}px`);
		expect(textarea.style.overflowY).toBe("hidden");

		scrollHeight = 240;
		textarea.dispatchEvent(new Event("input", { bubbles: true }));
		expect(textarea.style.height).toBe("192px");
		expect(textarea.style.overflowY).toBe("auto");

		// Removing content shrinks the textarea and removes the scrollbar.
		scrollHeight = 96;
		textarea.dispatchEvent(new Event("input", { bubbles: true }));
		expect(textarea.style.height).toBe(`${96 + borderHeight}px`);
		expect(textarea.style.overflowY).toBe("hidden");
	});

	it("builds its body from Obsidian's own components", () => {
		const { modal } = openModal(null);

		// Four native numeric time inputs and one textarea — all created by
		// Obsidian's `TextComponent` / `TextAreaComponent`.
		const inputs = timeInputsOf(modal);
		expect(inputs).toHaveLength(4);
		expect(inputs.map((input) => input.type)).toEqual(["text", "text", "text", "text"]);
		expect(inputs.map((input) => input.value)).toEqual(["09", "00", "10", "00"]);
		expect(inputs.map((input) => input.getAttribute("aria-label"))).toEqual([
			"Start hour",
			"Start minute",
			"End hour",
			"End minute",
		]);
		// Text inputs don't use min/max/step attributes; validation is handled in JS
		expect(textareaOf(modal).tagName).toBe("TEXTAREA");

		// Category dropdown is a native <select>
		const dropdown = categoryDropdownOf(modal);
		expect(dropdown.tagName).toBe("SELECT");
		expect(dropdown.getAttribute("aria-label")).toBe("Category");

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
		timeInputsOf(modal)[0].value = "24";

		buttonLabelled(modal, "Save").click();

		expect(saved).toHaveLength(0);
		expect(Notice.shown).toHaveLength(1);
		expect(Notice.shown[0]).toContain("09:00");
	});

	it("accepts 24:00 as an end time but not as a start time", () => {
		const { modal, saved } = openModal(null);
		const [startHour, startMinute, endHour, endMinute] = timeInputsOf(modal);
		startHour.value = "9";
		startMinute.value = "0";
		endHour.value = "24";
		endMinute.value = "0";

		buttonLabelled(modal, "Save").click();

		expect(saved).toHaveLength(1);
		expect(saved[0].start).toBe("09:00");
		expect(saved[0].end).toBe("24:00");
	});

	it("rejects 24:00 as a start time", () => {
		const { modal, saved } = openModal(null);
		const [startHour, startMinute] = timeInputsOf(modal);
		startHour.value = "24";
		startMinute.value = "0";

		buttonLabelled(modal, "Save").click();

		expect(saved).toHaveLength(0);
		expect(Notice.shown).toHaveLength(1);
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

	it("shows dropdown with 'No category' first, then settings categories", () => {
		const { modal } = openModal(null);
		const dropdown = categoryDropdownOf(modal);

		// First option is "No category" with empty value
		expect(dropdown.options[0].text).toBe("No category");
		expect(dropdown.options[0].value).toBe("");

		// Then settings categories in order
		expect(dropdown.options[1].text).toBe("Work");
		expect(dropdown.options[1].value).toBe("Work");
		expect(dropdown.options[2].text).toBe("Study");
		expect(dropdown.options[2].value).toBe("Study");
	});

	it("selecting a category changes the saved value", () => {
		const { modal, saved } = openModal(null);
		const dropdown = categoryDropdownOf(modal);

		dropdown.value = "Work";
		dropdown.dispatchEvent(new Event("change", { bubbles: true }));

		buttonLabelled(modal, "Save").click();
		expect(saved[0].category).toBe("Work");
	});

	it("selecting 'No category' saves undefined", () => {
		const { modal, saved } = openModal(null);
		const dropdown = categoryDropdownOf(modal);

		dropdown.value = "";
		dropdown.dispatchEvent(new Event("change", { bubbles: true }));

		buttonLabelled(modal, "Save").click();
		expect(saved[0].category).toBeUndefined();
	});

	it("a category missing from settings still appears and can be cleared", () => {
		const { modal, saved } = openModal(item({ category: "OldCategory" }));
		const dropdown = categoryDropdownOf(modal);

		// OldCategory should appear as an extra option
		const values = [...dropdown.options].map((o) => o.value);
		expect(values).toContain("OldCategory");

		// Initially selected
		expect(dropdown.value).toBe("OldCategory");

		// Can be cleared by selecting "No category"
		dropdown.value = "";
		dropdown.dispatchEvent(new Event("change", { bubbles: true }));

		buttonLabelled(modal, "Save").click();
		expect(saved[0].category).toBeUndefined();
	});

	it("focus goes to the dropdown for a new entry", () => {
		const { modal } = openModal(null);
		const dropdown = categoryDropdownOf(modal);
		// Use toStrictEqual because happy-dom may return different object references for the same element
		expect(document.activeElement).toStrictEqual(dropdown);
	});

	it("focus goes to the description when editing", () => {
		const { modal } = openModal(item());
		const textarea = textareaOf(modal);
		expect(document.activeElement).toStrictEqual(textarea);
	});

	it("resolves stale category case-insensitively in dropdown", () => {
		const { modal, saved } = openModal(item({ category: "work" }));
		const dropdown = categoryDropdownOf(modal);

		// A differently-cased old tag should resolve to the configured category
		expect(dropdown.value).toBe("Work");
		buttonLabelled(modal, "Save").click();
		expect(saved[0].category).toBe("work");
	});

	it("allows overnight ranges (end before start)", () => {
		const { modal, saved } = openModal(null);
		const [startHour, startMinute, endHour, endMinute] = timeInputsOf(modal);
		startHour.value = "23";
		startMinute.value = "0";
		endHour.value = "1";
		endMinute.value = "0";

		buttonLabelled(modal, "Save").click();

		expect(saved).toHaveLength(1);
		expect(saved[0].start).toBe("23:00");
		expect(saved[0].end).toBe("01:00");
	});

	it("rejects equal start and end times", () => {
		const { modal, saved } = openModal(null);
		const [startHour, startMinute, endHour, endMinute] = timeInputsOf(modal);
		startHour.value = "9";
		startMinute.value = "0";
		endHour.value = "9";
		endMinute.value = "0";

		buttonLabelled(modal, "Save").click();

		expect(saved).toHaveLength(0);
		expect(Notice.shown).toHaveLength(1);
	});

	it("submits with Ctrl+Enter from the category control", () => {
		const { modal, saved } = openModal(null);
		const event = new KeyboardEvent("keydown", {
			key: "Enter",
			ctrlKey: true,
			bubbles: true,
			cancelable: true,
		});

		categoryDropdownOf(modal).dispatchEvent(event);

		expect(event.defaultPrevented).toBe(true);
		expect(saved).toHaveLength(1);
	});

	it("submits with Cmd+Enter on macOS", () => {
		const { modal, saved } = openModal(null);
		const event = new KeyboardEvent("keydown", {
			key: "Enter",
			metaKey: true,
			bubbles: true,
			cancelable: true,
		});

		textareaOf(modal).dispatchEvent(event);

		expect(event.defaultPrevented).toBe(true);
		expect(saved).toHaveLength(1);
	});

	it("pads single-digit hour and minute values when a field loses focus", () => {
		const { modal } = openModal(null);
		const [startHour, startMinute] = timeInputsOf(modal);
		startHour.value = "9";
		startMinute.value = "5";

		startHour.dispatchEvent(new Event("blur"));
		startMinute.dispatchEvent(new Event("blur"));

		expect(startHour.value).toBe("09");
		expect(startMinute.value).toBe("05");
	});

	it("submits with plain Enter from time inputs", () => {
		const { modal, saved } = openModal(null);
		const [startHour, startMinute, endHour, endMinute] = timeInputsOf(modal);
		startHour.value = "9";
		startMinute.value = "0";
		endHour.value = "10";
		endMinute.value = "0";

		endMinute.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

		expect(saved).toHaveLength(1);
		expect(saved[0].start).toBe("09:00");
	});

	it("asks for the delete and closes when the delete button is pressed", () => {
		const deleted = vi.fn();
		const { modal } = openModal(item(), deleted);

		buttonLabelled(modal, "Delete").click();

		expect(deleted).toHaveBeenCalledTimes(1);
	});

	describe("fenced code block regression (P2-2)", () => {
		it("rejects a description with a closed backtick fenced code block", () => {
			const { modal, saved } = openModal(null);
			textareaOf(modal).value = "first\n```\ncode block\n```\nsecond";

			buttonLabelled(modal, "Save").click();

			expect(saved).toHaveLength(0);
			expect(Notice.shown).toHaveLength(1);
		});

		it("rejects a description with a closed tilde fenced code block", () => {
			const { modal, saved } = openModal(null);
			textareaOf(modal).value = "first\n~~~\ncode block\n~~~\nsecond";

			buttonLabelled(modal, "Save").click();

			expect(saved).toHaveLength(0);
			expect(Notice.shown).toHaveLength(1);
		});

		it("rejects a description with an unclosed backtick fenced code block", () => {
			const { modal, saved } = openModal(null);
			textareaOf(modal).value = "first\n```\ncode block without closing";

			buttonLabelled(modal, "Save").click();

			expect(saved).toHaveLength(0);
			expect(Notice.shown).toHaveLength(1);
		});

		it("rejects a description with an unclosed tilde fenced code block", () => {
			const { modal, saved } = openModal(null);
			textareaOf(modal).value = "first\n~~~\ncode block without closing";

			buttonLabelled(modal, "Save").click();

			expect(saved).toHaveLength(0);
			expect(Notice.shown).toHaveLength(1);
		});

		it("accepts ordinary inline Markdown code", () => {
			const { modal, saved } = openModal(null);
			textareaOf(modal).value = "Use `npm test` to run the tests";

			buttonLabelled(modal, "Save").click();

			expect(saved).toHaveLength(1);
			expect(saved[0].description).toBe("Use `npm test` to run the tests");
		});
	});

	describe("digit rollover between hour and minute inputs", () => {
		it("typing four digits into start hour auto-advances to start minute and produces correct time", () => {
			const { modal, saved } = openModal(null);
			const [startHour, startMinute, endHour, endMinute] = timeInputsOf(modal);

			// Simulate typing "0930" into start hour
			startHour.value = "09";
			startHour.dispatchEvent(new Event("input", { bubbles: true }));

			// Focus should have moved to start minute
			expect(document.activeElement).toStrictEqual(startMinute);

			// Type the remaining digits
			startMinute.value = "30";
			startMinute.dispatchEvent(new Event("input", { bubbles: true }));

			// Fill end time
			endHour.value = "10";
			endHour.dispatchEvent(new Event("input", { bubbles: true }));
			endMinute.value = "00";
			endMinute.dispatchEvent(new Event("input", { bubbles: true }));

			buttonLabelled(modal, "Save").click();

			expect(saved).toHaveLength(1);
			expect(saved[0].start).toBe("09:30");
			expect(saved[0].end).toBe("10:00");
		});

		it("typing four digits into end hour auto-advances to end minute and produces correct time", () => {
			const { modal, saved } = openModal(null);
			const [startHour, startMinute, endHour, endMinute] = timeInputsOf(modal);

			// Fill start time first
			startHour.value = "09";
			startHour.dispatchEvent(new Event("input", { bubbles: true }));
			startMinute.value = "00";
			startMinute.dispatchEvent(new Event("input", { bubbles: true }));

			// Simulate typing "1245" into end hour
			endHour.value = "12";
			endHour.dispatchEvent(new Event("input", { bubbles: true }));

			// Focus should have moved to end minute
			expect(document.activeElement).toStrictEqual(endMinute);

			// Type the remaining digits
			endMinute.value = "45";
			endMinute.dispatchEvent(new Event("input", { bubbles: true }));

			buttonLabelled(modal, "Save").click();

			expect(saved).toHaveLength(1);
			expect(saved[0].start).toBe("09:00");
			expect(saved[0].end).toBe("12:45");
		});

		it("pasting 0930 into start hour distributes digits correctly", () => {
			const { modal, saved } = openModal(null);
			const [startHour, startMinute, endHour, endMinute] = timeInputsOf(modal);

			// Paste "0930" into start hour
			const pasteEvent = new ClipboardEvent("paste", {
				clipboardData: new DataTransfer(),
				bubbles: true,
				cancelable: true,
			});
			pasteEvent.clipboardData?.setData("text/plain", "0930");
			startHour.dispatchEvent(pasteEvent);

			// Values should be distributed
			expect(startHour.value).toBe("09");
			expect(startMinute.value).toBe("30");

			// Focus should be on minute with selection
			expect(document.activeElement).toStrictEqual(startMinute);

			// Fill end time
			endHour.value = "10";
			endHour.dispatchEvent(new Event("input", { bubbles: true }));
			endMinute.value = "00";
			endMinute.dispatchEvent(new Event("input", { bubbles: true }));

			buttonLabelled(modal, "Save").click();

			expect(saved).toHaveLength(1);
			expect(saved[0].start).toBe("09:30");
			expect(saved[0].end).toBe("10:00");
		});

		it("pasting 2400 into end hour produces valid end time", () => {
			const { modal, saved } = openModal(null);
			const [startHour, startMinute, endHour, endMinute] = timeInputsOf(modal);

			// Fill start time
			startHour.value = "23";
			startHour.dispatchEvent(new Event("input", { bubbles: true }));
			startMinute.value = "00";
			startMinute.dispatchEvent(new Event("input", { bubbles: true }));

			// Paste "2400" into end hour
			const pasteEvent = new ClipboardEvent("paste", {
				clipboardData: new DataTransfer(),
				bubbles: true,
				cancelable: true,
			});
			pasteEvent.clipboardData?.setData("text/plain", "2400");
			endHour.dispatchEvent(pasteEvent);

			// Values should be distributed
			expect(endHour.value).toBe("24");
			expect(endMinute.value).toBe("00");

			buttonLabelled(modal, "Save").click();

			expect(saved).toHaveLength(1);
			expect(saved[0].start).toBe("23:00");
			expect(saved[0].end).toBe("24:00");
		});

		it("24:00 remains invalid as a start time - pasting 2400 clamps to 23:00", () => {
			const { modal, saved } = openModal(null);
			const [startHour, startMinute, endHour, endMinute] = timeInputsOf(modal);

			// Try to paste "2400" into start hour
			const pasteEvent = new ClipboardEvent("paste", {
				clipboardData: new DataTransfer(),
				bubbles: true,
				cancelable: true,
			});
			pasteEvent.clipboardData?.setData("text/plain", "2400");
			startHour.dispatchEvent(pasteEvent);

			// Hour should be clamped to 23 (max for start time)
			expect(startHour.value).toBe("23");
			expect(startMinute.value).toBe("00");

			// Fill end time with a different time
			endHour.value = "23";
			endHour.dispatchEvent(new Event("input", { bubbles: true }));
			endMinute.value = "30";
			endMinute.dispatchEvent(new Event("input", { bubbles: true }));

			buttonLabelled(modal, "Save").click();

			// Should succeed with clamped start time 23:00 and end time 23:30
			expect(saved).toHaveLength(1);
			expect(saved[0].start).toBe("23:00");
			expect(saved[0].end).toBe("23:30");
		});

		it("start hour input clamps to 23, preventing 24:00 as start time", () => {
			const { modal, saved } = openModal(null);
			const [startHour, startMinute, endHour, endMinute] = timeInputsOf(modal);

			// Try to type "24" into start hour - should be clamped to 23
			startHour.value = "24";
			startHour.dispatchEvent(new Event("input", { bubbles: true }));

			// Value should be clamped to 23
			expect(startHour.value).toBe("23");

			startMinute.value = "00";
			startMinute.dispatchEvent(new Event("input", { bubbles: true }));

			// Fill end time
			endHour.value = "24";
			endHour.dispatchEvent(new Event("input", { bubbles: true }));
			endMinute.value = "00";
			endMinute.dispatchEvent(new Event("input", { bubbles: true }));

			buttonLabelled(modal, "Save").click();

			// Should succeed with clamped start time 23:00 and end time 24:00
			expect(saved).toHaveLength(1);
			expect(saved[0].start).toBe("23:00");
			expect(saved[0].end).toBe("24:00");
		});

		it("typing two digits in a minute field does not unexpectedly move focus", () => {
			const { modal } = openModal(null);
			const [startHour, startMinute, endHour, endMinute] = timeInputsOf(modal);

			// Fill start hour
			startHour.value = "09";
			startHour.dispatchEvent(new Event("input", { bubbles: true }));

			// Now type two digits in start minute
			startMinute.value = "30";
			startMinute.dispatchEvent(new Event("input", { bubbles: true }));

			// Focus should remain on start minute (not move to end hour)
			expect(document.activeElement).toStrictEqual(startMinute);

			// Fill the rest
			endHour.value = "10";
			endHour.dispatchEvent(new Event("input", { bubbles: true }));
			endMinute.value = "00";
			endMinute.dispatchEvent(new Event("input", { bubbles: true }));

			buttonLabelled(modal, "Save").click();
		});

		it("existing single-digit padding and time validation still work", () => {
			const { modal } = openModal(null);
			const [startHour, startMinute] = timeInputsOf(modal);

			// Type single digits
			startHour.value = "9";
			startHour.dispatchEvent(new Event("input", { bubbles: true }));
			startMinute.value = "5";
			startMinute.dispatchEvent(new Event("input", { bubbles: true }));

			// Blur should pad them
			startHour.dispatchEvent(new Event("blur"));
			startMinute.dispatchEvent(new Event("blur"));

			expect(startHour.value).toBe("09");
			expect(startMinute.value).toBe("05");
		});

		it("modal's existing description, category and save tests remain unaffected", () => {
			const { modal, saved } = openModal(null);
			const [startHour, startMinute, endHour, endMinute] = timeInputsOf(modal);
			const dropdown = categoryDropdownOf(modal);
			const textarea = textareaOf(modal);

			// Set time using new input method
			startHour.value = "09";
			startHour.dispatchEvent(new Event("input", { bubbles: true }));
			startMinute.value = "30";
			startMinute.dispatchEvent(new Event("input", { bubbles: true }));
			endHour.value = "10";
			endHour.dispatchEvent(new Event("input", { bubbles: true }));
			endMinute.value = "00";
			endMinute.dispatchEvent(new Event("input", { bubbles: true }));

			// Set category
			dropdown.value = "Work";
			dropdown.dispatchEvent(new Event("change", { bubbles: true }));

			// Set description
			textarea.value = "Test description";

			buttonLabelled(modal, "Save").click();

			expect(saved).toHaveLength(1);
			expect(saved[0].start).toBe("09:30");
			expect(saved[0].end).toBe("10:00");
			expect(saved[0].category).toBe("Work");
			expect(saved[0].description).toBe("Test description");
		});
	});
});
