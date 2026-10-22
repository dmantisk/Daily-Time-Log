import { App, ButtonComponent, Modal, Notice, TextAreaComponent, TextComponent } from "obsidian";
import { t } from "../i18n";
import { isTopLevelOrMarker, stripHtml, TIME_END_VALUE_REGEX, TIME_VALUE_REGEX, type MarkerLanguage, type TimelineItem } from "../parser";
import type { CustomCategory } from "../settings";

export interface EventEntryValues {
	start: string;
	end: string;
	/** Category *display name*, stored verbatim in the body (AGENTS.md 1.4.1) — undefined when left uncategorized. */
	category?: string;
	description: string;
}

/**
 * Add/edit modal for Event (Timeline) items.
 *
 * The body is built from Obsidian's own components — `TextComponent`,
 * `TextAreaComponent` and `ButtonComponent` — so the inputs, the button
 * row and the destructive/primary button styling are the app's own and
 * follow the active theme (AGENTS.md §2, §3).
 *
 * The category chips stay hand-rolled: Obsidian has no native control
 * for a set of coloured category labels, so they are the one piece of
 * custom UI this modal keeps.
 */
export class TimelineModal extends Modal {
	private startComponent: TextComponent | null = null;
	private endComponent: TextComponent | null = null;
	private descriptionComponent: TextAreaComponent | null = null;

	/**
	 * The category picked in the modal, or `undefined` for uncategorized.
	 *
	 * Held on the instance rather than in a local because the chips are
	 * re-rendered whenever the selection changes, and the value has to
	 * survive that.
	 */
	private selectedCategory: string | undefined;

	/** The raw markup the description was parsed from, kept for the untouched-restore rule. */
	private readonly originalDescription: string;

	constructor(
		app: App,
		private readonly language: MarkerLanguage,
		private readonly categories: CustomCategory[],
		private readonly initial: TimelineItem | null,
		private readonly defaultStart: string,
		private readonly defaultEnd: string,
		private readonly onSave: (values: EventEntryValues) => void,
		private readonly onRequestDelete: (() => void) | null
	) {
		super(app);
		this.selectedCategory = initial ? initial.category : undefined;
		this.originalDescription = initial ? initial.description : "";
	}

	onOpen(): void {
		this.setTitle(this.initial ? t("modalEditTitle", this.language) : t("modalAddTitle", this.language));

		const body = this.contentEl.createDiv({ cls: "dwl-modal-body" });

		// --- Time setting ---
		const timeField = body.createDiv({ cls: "dwl-modal-field" });
		timeField.createEl("label", { cls: "dwl-modal-label", text: t("lblTimeSet", this.language) });

		const timeRow = timeField.createDiv({ cls: "dwl-modal-time-row" });
		this.startComponent = new TextComponent(timeRow);
		this.startComponent
			.setPlaceholder("09:00")
			.setValue(this.initial ? this.initial.start : this.defaultStart);
		this.startComponent.inputEl.addClass("dwl-modal-time-input");

		this.endComponent = new TextComponent(timeRow);
		this.endComponent
			.setPlaceholder("10:00")
			.setValue(this.initial ? this.initial.end : this.defaultEnd);
		this.endComponent.inputEl.addClass("dwl-modal-time-input");

		// --- Category ---
		const categoryField = body.createDiv({ cls: "dwl-modal-field" });
		categoryField.createEl("label", { cls: "dwl-modal-label", text: t("fieldCategory", this.language) });
		this.renderCategoryChips(categoryField);

		// --- Description ---
		const descriptionField = body.createDiv({ cls: "dwl-modal-field" });
		descriptionField.createEl("label", { cls: "dwl-modal-label", text: t("lblContent", this.language) });
		this.descriptionComponent = new TextAreaComponent(descriptionField);
		this.descriptionComponent
			.setPlaceholder(t("descPlaceholder", this.language))
			// The textarea shows the HTML-stripped form for readability; the
			// original raw markup is only restored on save, and only if this
			// field was never touched, so a plugin like Editing Toolbar that
			// wrote raw <font>/<b> tags doesn't get its formatting silently
			// deleted just from opening and re-saving an event without
			// editing the text.
			.setValue(this.initial ? stripHtml(this.originalDescription) : "");
		this.descriptionComponent.inputEl.addClass("dwl-modal-textarea");
		this.descriptionComponent.inputEl.rows = 3;
		// Obsidian's input components turn the spellchecker off, which is
		// right for a time field but wrong for free prose.
		this.descriptionComponent.inputEl.setAttribute("spellcheck", "true");

		// --- Actions ---
		// The native `.modal-button-container` is the row Obsidian itself
		// uses in modals, and its `.mod-secondary` rule pushes the button
		// it wraps to the far left — which is where the delete button
		// belongs (design.md §4.2).
		const buttons = this.contentEl.createDiv({ cls: "modal-button-container" });

		if (this.onRequestDelete) {
			new ButtonComponent(buttons)
				.setButtonText(t("btnDelete", this.language))
				// `mod-destructive` is the app's own destructive styling;
				// `mod-secondary` is the class Obsidian's own confirmation
				// buttons use to push a button to the far left of the row
				// — which is where the delete action belongs
				// (design.md §4.2). `ButtonComponent` has no
				// `setSecondary()` (that lives on `ConfirmationButton`),
				// but the class itself is plain CSS and applies to any
				// element.
				.setDestructive()
				.setClass("mod-secondary")
				.onClick(() => {
					this.close();
					this.onRequestDelete?.();
				});
		}

		new ButtonComponent(buttons)
			.setButtonText(t("btnCancel", this.language))
			.onClick(() => this.close());

		new ButtonComponent(buttons)
			.setButtonText(t("btnSave", this.language))
			.setCta()
			.onClick(() => this.handleSave());
	}

	/**
	 * Renders the category chips and keeps the selected one in sync.
	 *
	 * Obsidian has no native control for a set of coloured category
	 * labels, so these stay hand-rolled — but the selected chip uses the
	 * app's own `.mod-cta` styling.
	 */
	private renderCategoryChips(parent: HTMLElement): void {
		// The chip row is rebuilt from scratch on every selection change,
		// so the previous row has to go — otherwise the old chips would
		// stay in the DOM next to the new ones.
		const existing = parent.querySelector(".dwl-category-chips");
		if (existing) existing.remove();

		const chips = parent.createDiv({ cls: "dwl-category-chips" });
		for (const cat of this.categories) {
			const selected = this.selectedCategory === cat.displayName;
			const chip = chips.createEl("button", {
				cls: selected ? "dwl-category-chip mod-cta" : "dwl-category-chip",
				type: "button",
			});
			chip.createSpan({ cls: "dwl-category-chip-preview" }).style.backgroundColor = cat.color;
			chip.createSpan({ text: cat.displayName });
			chip.addEventListener("click", () => {
				// Clicking the selected chip clears the category, so the
				// entry can be taken back to "uncategorized".
				this.selectedCategory = selected ? undefined : cat.displayName;
				this.renderCategoryChips(parent);
			});
		}
	}

	/**
	 * Validates the entry and hands it to the caller.
	 *
	 * Every rule here matches the one the React version applied, in the
	 * same order, so the two behave identically:
	 *
	 * 1. The end time may be `24:00` (midnight at the end of the day) —
	 *    that is what the grid produces when the end hour is 24, and what
	 *    the end-hour setting advertises. The start time may not.
	 * 2. The description is trimmed, and consecutive blank lines are
	 *    capped at one (3+ newlines in a row collapse to exactly 2) — a
	 *    run of several blank lines carries no extra meaning over a
	 *    single paragraph break, just extra stored lineCount.
	 * 3. A continuation line shaped like a real event, checkbox, or
	 *    heading would be misread as a new top-level item on the next
	 *    parse instead of staying part of this description
	 *    (AGENTS.md 1.4.2) — reject rather than silently losing it.
	 */
	private handleSave(): void {
		const start = this.startComponent?.getValue() ?? "";
		const end = this.endComponent?.getValue() ?? "";
		const description = this.descriptionComponent?.getValue() ?? "";

		if (!TIME_VALUE_REGEX.test(start) || !TIME_END_VALUE_REGEX.test(end)) {
			new Notice(t("invalidTimeFormat", this.language));
			return;
		}

		const isDescriptionUnchanged = this.initial !== null && description === stripHtml(this.originalDescription);
		const rawDescription = isDescriptionUnchanged ? this.originalDescription : description;
		const trimmedDescription = rawDescription.trim().replace(/\n{3,}/g, "\n\n");

		const continuationLines = trimmedDescription.split("\n").slice(1);
		if (continuationLines.some((line) => isTopLevelOrMarker(line))) {
			new Notice(t("multilineContinuationError", this.language));
			return;
		}

		this.onSave({
			start,
			end,
			category: this.selectedCategory,
			description: trimmedDescription,
		});
		this.close();
	}

	onClose(): void {
		this.startComponent = null;
		this.endComponent = null;
		this.descriptionComponent = null;
		this.contentEl.empty();
	}
}
