import { App, Modal } from "obsidian";

/**
 * Generic confirm/cancel dialog reused for Event deletion (design.md §4.3).
 * Callers own the copy (title/message/button
 * labels) so this stays purely presentational and i18n-agnostic.
 */
export class ConfirmDeleteModal extends Modal {
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
		const { contentEl } = this;
		this.titleEl.setText(this.titleText);

		contentEl.createEl("p", { cls: "dwl-modal-text", text: this.message });

		const buttonRow = contentEl.createDiv({ cls: "dwl-modal-buttons" });

		const cancelBtn = buttonRow.createEl("button", { text: this.cancelText });
		cancelBtn.addEventListener("click", () => this.close());

		const okBtn = buttonRow.createEl("button", { cls: "mod-cta", text: this.okText });
		okBtn.addEventListener("click", () => {
			this.onConfirm();
			this.close();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
