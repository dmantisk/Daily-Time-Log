/**
 * @vitest-environment happy-dom
 *
 * The delete-confirmation dialog.
 *
 * The dialog is Obsidian's own `ConfirmationModal`, so the app owns the
 * button row, the cancel/confirm pairing and the destructive styling.
 * What matters here is that the plugin still behaves the way it did: the
 * message is shown, the confirm action runs the caller's callback, the
 * cancel action does nothing, and the modal closes once the confirm
 * handler resolves.
 */

import { describe, expect, it, vi } from "vitest";
import { installObsidianDomHelpers } from "../test/obsidian-dom-mock";

installObsidianDomHelpers();

import { ConfirmDeleteModal } from "./ConfirmDeleteModal";

/** Opens the dialog and returns it together with the confirmation spy. */
function openDialog(): { modal: ConfirmDeleteModal; confirmed: () => boolean } {
	const onConfirm = vi.fn();
	const modal = new ConfirmDeleteModal(
		{} as never,
		"Delete event",
		"Delete this event?",
		"Cancel",
		"OK",
		onConfirm
	);
	modal.open();
	return { modal, confirmed: () => onConfirm.mock.calls.length > 0 };
}

/** The buttons of the dialog's button row, in order. */
function buttonsOf(modal: ConfirmDeleteModal): HTMLButtonElement[] {
	return [...modal.buttonContainerEl.querySelectorAll<HTMLButtonElement>("button")];
}

describe("ConfirmDeleteModal", () => {
	it("shows the title and the message", () => {
		const { modal } = openDialog();

		expect(modal.titleEl.textContent).toBe("Delete event");
		expect(modal.contentEl.textContent).toContain("Delete this event?");
	});

	it("owns its button row in Obsidian's own container", () => {
		const { modal } = openDialog();

		// The row lives on `modalEl` (a sibling of `contentEl`) inside
		// Obsidian's own `.modal-button-container`.
		expect(modal.buttonContainerEl.classList.contains("modal-button-container")).toBe(true);
		expect(modal.modalEl.contains(modal.buttonContainerEl)).toBe(true);
	});

	it("pairs a cancel button with a destructive confirm button", () => {
		const { modal } = openDialog();

		const buttons = buttonsOf(modal);
		expect(buttons.map((b) => b.textContent)).toEqual(["OK", "Cancel"]);

		// The confirm button is the app's "destructive primary action".
		expect(buttons[0].classList.contains("mod-destructive")).toBe(true);
		expect(buttons[0].classList.contains("mod-cta")).toBe(true);

		// The cancel button carries the app's dismissal styling.
		expect(buttons[1].classList.contains("mod-cancel")).toBe(true);
	});

	it("runs the confirmation when the confirm button is pressed", () => {
		const { modal, confirmed } = openDialog();

		buttonsOf(modal)[0].click();

		expect(confirmed()).toBe(true);
	});

	it("does not confirm when the cancel button is pressed", () => {
		const { modal, confirmed } = openDialog();

		buttonsOf(modal)[1].click();

		expect(confirmed()).toBe(false);
	});
});
