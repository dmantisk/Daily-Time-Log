import { App, ButtonComponent, DropdownComponent, Modal, Notice, TextAreaComponent, TextComponent } from "obsidian";
import { t } from "../i18n";
import { findCategoryByDisplayName } from "../settings";
import {
	FenceTracker,
	isTopLevelOrMarker,
	stripHtml,
	TIME_END_VALUE_REGEX,
	TIME_VALUE_REGEX,
	timeToMinutes,
	type MarkerLanguage,
	type TimelineItem,
} from "../parser";
import type { CustomCategory } from "../settings";

export interface EventEntryValues {
	start: string;
	end: string;
	/** Category *display name*, stored verbatim in the body (AGENTS-reference.md) — undefined when left uncategorized. */
	category?: string;
	description: string;
}

/**
 * Add/edit modal for Event (Timeline) items.
 *
 * The body is built from Obsidian's own components — `TextComponent`,
 * `TextAreaComponent`, `DropdownComponent` and `ButtonComponent` — so the
 * inputs, the button row and the destructive/primary button styling are
 * the app's own and follow the active theme (AGENTS-reference.md).
 */
export class TimelineModal extends Modal {
	private startHourComponent: TextComponent | null = null;
	private startMinuteComponent: TextComponent | null = null;
	private endHourComponent: TextComponent | null = null;
	private endMinuteComponent: TextComponent | null = null;
	private descriptionComponent: TextAreaComponent | null = null;
	private categoryDropdown: DropdownComponent | null = null;
	private categoryDot: HTMLSpanElement | null = null;

	/**
	 * The category picked in the modal, or `undefined` for uncategorized.
	 */
	private selectedCategory: string | undefined;

	private readonly onModalKeydown = (event: KeyboardEvent): void => {
		if (event.key !== "Enter" || (!event.ctrlKey && !event.metaKey)) return;
		event.preventDefault();
		event.stopPropagation();
		this.handleSave();
	};

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
		this.contentEl.addEventListener("keydown", this.onModalKeydown);
		this.setTitle(this.initial ? t("modalEditTitle", this.language) : t("modalAddTitle", this.language));

		const body = this.contentEl.createDiv({ cls: "dwl-modal-body" });

		// --- Metadata row: Start Time | End Time | Category ---
		const metadataRow = body.createDiv({ cls: "dwl-modal-metadata-row" });

		// Start Time group
		const startGroup = metadataRow.createDiv({ cls: "dwl-modal-time-group" });
		const startLabel = startGroup.createSpan({ cls: "dwl-modal-time-label", text: t("lblStartTime", this.language) });
		startLabel.setAttribute("aria-hidden", "true"); // Inputs have their own aria-labels
		const startParts = startGroup.createDiv({ cls: "dwl-modal-time-parts" });
		const [startHour = "", startMinute = ""] = (this.initial?.start ?? this.defaultStart).split(":");
		this.startHourComponent = this.createTimeInput(
			startParts,
			`${t("lblStartTime", this.language)} ${t("lblHour", this.language)}`,
			startHour,
			23,
			true
		);
		startParts.createSpan({ cls: "dwl-modal-time-separator", text: ":" });
		this.startMinuteComponent = this.createTimeInput(
			startParts,
			`${t("lblStartTime", this.language)} ${t("lblMinute", this.language)}`,
			startMinute,
			59,
			false
		);
		this.linkTimeInputs(this.startHourComponent, this.startMinuteComponent);

		// End Time group
		const endGroup = metadataRow.createDiv({ cls: "dwl-modal-time-group" });
		const endLabel = endGroup.createSpan({ cls: "dwl-modal-time-label", text: t("lblEndTime", this.language) });
		endLabel.setAttribute("aria-hidden", "true");
		const endParts = endGroup.createDiv({ cls: "dwl-modal-time-parts" });
		const [endHour = "", endMinute = ""] = (this.initial?.end ?? this.defaultEnd).split(":");
		this.endHourComponent = this.createTimeInput(
			endParts,
			`${t("lblEndTime", this.language)} ${t("lblHour", this.language)}`,
			endHour,
			24,
			true
		);
		endParts.createSpan({ cls: "dwl-modal-time-separator", text: ":" });
		this.endMinuteComponent = this.createTimeInput(
			endParts,
			`${t("lblEndTime", this.language)} ${t("lblMinute", this.language)}`,
			endMinute,
			59,
			false
		);
		this.linkTimeInputs(this.endHourComponent, this.endMinuteComponent);

		// Category group
		const categoryGroup = metadataRow.createDiv({ cls: "dwl-modal-category-group" });
		const categoryLabel = categoryGroup.createSpan({ cls: "dwl-modal-category-label", text: t("fieldCategory", this.language) });
		categoryLabel.setAttribute("aria-hidden", "true"); // Dropdown has its own aria-label

		this.categoryDropdown = new DropdownComponent(categoryGroup);
		this.categoryDropdown.selectEl.addClass("dwl-category-dropdown");
		this.categoryDropdown.selectEl.setAttribute("aria-label", t("fieldCategory", this.language));

		// "No category" option first
		this.categoryDropdown.addOption("", t("categoryNone", this.language));

		// Categories from settings, in order
		for (const cat of this.categories) {
			this.categoryDropdown.addOption(cat.displayName, cat.displayName);
		}

		// If the current category is not in settings, add it so it can be seen/cleared
		const currentCategory = this.selectedCategory;
		if (
			currentCategory &&
			!this.categories.some((c) => c.displayName.trim().toLowerCase() === currentCategory.trim().toLowerCase())
		) {
			this.categoryDropdown.addOption(currentCategory, currentCategory);
		}

		// Set initial value using case-insensitive, trimmed matching
		const selectedCat = findCategoryByDisplayName(this.categories, this.selectedCategory);
		const initialValue = selectedCat ? selectedCat.displayName : (this.selectedCategory ?? "");
		this.categoryDropdown.setValue(initialValue);

		// Colored dot next to dropdown
		this.categoryDot = categoryGroup.createSpan({ cls: "dwl-category-dot" });
		this.updateCategoryDot();

		this.categoryDropdown.onChange((value) => {
			this.selectedCategory = value || undefined;
			this.updateCategoryDot();
		});

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
		this.descriptionComponent.inputEl.rows = 4; // Increased from 3 to use the gained vertical space
		// Obsidian's input components turn the spellchecker off, which is
		// right for a time field but wrong for free prose.
		this.descriptionComponent.inputEl.setAttribute("spellcheck", "true");
		this.descriptionComponent.inputEl.addEventListener("input", () => this.resizeDescription());
		this.resizeDescription();
		descriptionField.createDiv({
			cls: "dwl-modal-shortcut-hint",
			text: t("modalSaveShortcutHint", this.language),
		});

		// Focus: new entry -> dropdown, editing -> description
		if (this.initial === null) {
			this.categoryDropdown?.selectEl.focus();
		} else {
			this.descriptionComponent?.inputEl.focus();
		}

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

		new ButtonComponent(buttons).setButtonText(t("btnCancel", this.language)).onClick(() => this.close());

		new ButtonComponent(buttons)
			.setButtonText(t("btnSave", this.language))
			.setCta()
			.onClick(() => this.handleSave());
	}

	/** Creates one native text input for an hour or minute segment with digit rollover. */
	private createTimeInput(
		containerEl: HTMLElement,
		ariaLabel: string,
		value: string,
		max: number,
		isHour: boolean
	): TextComponent {
		const component = new TextComponent(containerEl);
		component.inputEl.type = "text";
		component.inputEl.inputMode = "numeric";
		component.inputEl.setAttribute("aria-label", ariaLabel);
		component.inputEl.addClass("dwl-modal-time-input");
		component.inputEl.maxLength = 2;
		component.setValue(value.padStart(2, "0"));

		// Track if this is an hour input for rollover logic
		const isHourInput = isHour;
		const maxValue = max;

		// Handle input event for digit rollover and validation
		component.inputEl.addEventListener("input", (event) => {
			const input = event.target as HTMLInputElement;
			let value = input.value;

			// Strip non-numeric characters
			value = value.replace(/\D/g, "");

			// For hour inputs, enforce max (23 for start, 24 for end)
			if (isHourInput) {
				if (value.length === 2) {
					const hourVal = parseInt(value, 10);
					if (hourVal > maxValue) {
						value = String(maxValue);
					}
				}
			} else {
				// For minute inputs, enforce max 59
				if (value.length === 2) {
					const minuteVal = parseInt(value, 10);
					if (minuteVal > 59) {
						value = "59";
					}
				}
			}

			// Limit to 2 digits
			if (value.length > 2) {
				value = value.slice(0, 2);
			}

			// Update the input value if it changed
			if (input.value !== value) {
				input.value = value;
				component.setValue(value);
			}
		});

		// Handle paste event for 4-digit time distribution (only on hour inputs)
		if (isHourInput) {
			component.inputEl.addEventListener("paste", (event) => {
				const pasteData = event.clipboardData?.getData("text") ?? "";
				const digits = pasteData.replace(/\D/g, "");

				if (digits.length >= 4) {
					event.preventDefault();

					const hourPart = digits.slice(0, 2);
					const minutePart = digits.slice(2, 4);

					// Validate hour part
					const hourVal = parseInt(hourPart, 10);
					const validHour = hourVal <= maxValue ? hourPart : String(maxValue).padStart(2, "0");

					// Validate minute part
					const minuteVal = parseInt(minutePart, 10);
					const validMinute = minuteVal <= 59 ? minutePart : "59";

					component.setValue(validHour);
					component.inputEl.value = validHour;

					// The minute component will be set via a property we attach
					const pairMinute = (component.inputEl as HTMLInputElement & { pairMinute?: TextComponent }).pairMinute;
					if (pairMinute) {
						pairMinute.setValue(validMinute);
						pairMinute.inputEl.value = validMinute;
						pairMinute.inputEl.focus();
						pairMinute.inputEl.select();
					}
				}
			});
		}

		// Preserve existing blur behavior: pad single-digit values
		component.inputEl.addEventListener("blur", () => {
			const current = component.getValue();
			if (/^\d{1,2}$/.test(current)) component.setValue(current.padStart(2, "0"));
		});

		// Handle Enter key to save
		component.inputEl.addEventListener("keydown", (event) => {
			if (event.key === "Enter" && !event.ctrlKey && !event.metaKey) {
				this.handleSave();
				event.preventDefault();
				event.stopPropagation();
			}
		});

		// Select all text on focus for easy replacement
		component.inputEl.addEventListener("focus", () => {
			component.inputEl.select();
		});

		return component;
	}

	/** Links an hour input to its minute counterpart for auto-advance and paste distribution. */
	private linkTimeInputs(hourComponent: TextComponent, minuteComponent: TextComponent): void {
		// Store reference on the hour input for paste handling
		(hourComponent.inputEl as HTMLInputElement & { pairMinute?: TextComponent }).pairMinute = minuteComponent;

		// Auto-advance from hour to minute when 2 digits entered
		hourComponent.inputEl.addEventListener("input", () => {
			if (hourComponent.inputEl.value.length === 2) {
				minuteComponent.inputEl.focus();
				minuteComponent.inputEl.select();
			}
		});
	}

	/**
	 * Updates the colored dot next to the category dropdown.
	 */
	private updateCategoryDot(): void {
		if (!this.categoryDot) return;
		const cat = findCategoryByDisplayName(this.categories, this.selectedCategory);
		const color = cat?.color ?? "#95a5a6";
		this.categoryDot.style.backgroundColor = color;
	}

	/**
	 * Validates the entry and hands it to the caller.
	 *
	 * Every rule here preserves the existing sidebar behavior, in the
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
	 *    (AGENTS-reference.md) — reject rather than silently losing it.
	 */
	private handleSave(): void {
		const start = this.getTimeValue(this.startHourComponent, this.startMinuteComponent);
		const end = this.getTimeValue(this.endHourComponent, this.endMinuteComponent);
		const description = this.descriptionComponent?.getValue() ?? "";

		if (!TIME_VALUE_REGEX.test(start) || !TIME_END_VALUE_REGEX.test(end)) {
			new Notice(t("invalidTimeFormat", this.language));
			return;
		}

		// Reject equal start/end times; allow overnight ranges (end < start).
		const startMin = timeToMinutes(start);
		const endMin = timeToMinutes(end);
		if (endMin === startMin) {
			new Notice(t("endNotAfterStart", this.language));
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

		// Reject fenced code blocks in continuation lines (line 2 onward).
		// parseTimeline() treats fences as boundaries and detaches them from
		// the preceding event description, so accepting them here would cause
		// silent data loss on the next parse.
		const fence = new FenceTracker();
		for (const line of continuationLines) {
			if (fence.consume(line)) {
				new Notice(t("multilineContinuationError", this.language));
				return;
			}
		}

		this.onSave({
			start,
			end,
			category: this.selectedCategory,
			description: trimmedDescription,
		});
		this.close();
	}

	/** Combines two independently edited segments into the parser's HH:mm form. */
	private getTimeValue(hour: TextComponent | null, minute: TextComponent | null): string {
		const hourValue = hour?.getValue() ?? "";
		const minuteValue = minute?.getValue() ?? "";
		if (!/^\d{1,2}$/.test(hourValue) || !/^\d{1,2}$/.test(minuteValue)) return "";
		return `${hourValue.padStart(2, "0")}:${minuteValue.padStart(2, "0")}`;
	}

	/** Grows the description textarea with its content, up to a readable maximum. */
	private resizeDescription(): void {
		const textarea = this.descriptionComponent?.inputEl;
		if (!textarea) return;

		// Reset first so deleting text also lets the textarea shrink again.
		textarea.style.height = "auto";
		const computedStyle = window.getComputedStyle(textarea);
		const minHeight = Number.parseFloat(computedStyle.minHeight) || 80;
		const maxHeight = Number.parseFloat(computedStyle.maxHeight) || 192;
		const borderHeight =
			(Number.parseFloat(computedStyle.borderTopWidth) || 0) +
			(Number.parseFloat(computedStyle.borderBottomWidth) || 0);
		const contentHeight = textarea.scrollHeight + borderHeight;
		const nextHeight = Math.min(Math.max(contentHeight, minHeight), maxHeight);

		textarea.style.height = `${nextHeight}px`;
		textarea.style.overflowY = contentHeight > maxHeight ? "auto" : "hidden";
	}

	onClose(): void {
		this.contentEl.removeEventListener("keydown", this.onModalKeydown);
		this.startHourComponent = null;
		this.startMinuteComponent = null;
		this.endHourComponent = null;
		this.endMinuteComponent = null;
		this.descriptionComponent = null;
		this.categoryDropdown = null;
		this.categoryDot = null;
		this.contentEl.empty();
	}
}
