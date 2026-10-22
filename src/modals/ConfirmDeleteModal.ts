import { App, ConfirmationModal } from "obsidian";

/**
 * Generic confirm/cancel dialog reused for Event deletion (design.md §4.3).
 * Callers own the copy (title/message/button
 * labels) so this stays purely presentational and i18n-agnostic.
 *
 * Built on Obsidian's native `ConfirmationModal` (1.13.0) so the button
 * row, the cancel/confirm pairing and the destructive styling are the
 * app's own rather than hand-rolled markup.
 */
export class ConfirmDeleteModal extends ConfirmationModal {
	constructor(
		app: App,
		private readonly titleText: string,
		private readonly message: string,
		private readonly cancelText: string,
		private readonly okText: string,
		private readonly onConfirm: () => void
	) {
		super(app);
	}

	onOpen(): void {
		this.setTitle(this.titleText);
		this.contentEl.createEl("p", { cls: "dwl-modal-text", text: this.message });

		// The confirm button closes the modal by itself once the handler
		// resolves, so the handler only has to do the work.
		//
		// `setDestructive().setCta()` is the app's own "destructive primary
		// action" — the same combination Obsidian uses for its own delete
		// confirmation. (`setWarning()` does exactly this, but it is
		// deprecated in favour of the explicit pair.)
		this.addButton((btn) => {
			btn
				.setButtonText(this.okText)
				.setDestructive()
				.setCta()
				.setInitialFocus()
				.onClick(() => {
					this.onConfirm();
				});
		});

		this.addCancelButton(this.cancelText);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
