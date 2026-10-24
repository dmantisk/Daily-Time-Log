/**
 * Minimal runtime stub for the `obsidian` module.
 *
 * The published `obsidian` package is TYPES-ONLY (its package.json declares
 * `"main": ""` and it ships only `.d.ts` files), so any test that imports a
 * module which does `import ... from "obsidian"` at runtime fails to
 * resolve. `vitest.config.ts` aliases `obsidian` to this file so those
 * modules can be imported and exercised.
 *
 * Only the runtime *values* the plugin actually touches are provided.
 * Type-level APIs are intentionally absent — this file is not meant to be
 * imported by production code, and real types always come from the real
 * `obsidian` package via its `obsidian.d.ts` types entry.
 *
 * Keep this in sync with the `from "obsidian"` imports listed in
 * `.agents/AGENTS.md` §4 (test coverage) — every symbol added to a
 * production import from "obsidian" needs a runtime counterpart here.
 */

import moment from "moment";
import { StateField } from "@codemirror/state";

export { moment };

// ---------------------------------------------------------------------------
// CodeMirror / editor bridge
// ---------------------------------------------------------------------------

/**
 * State field carrying the editor's file info. `categoryBadges.ts` reads it
 * to learn the active file path. The real implementation is a CodeMirror
 * `StateField`; tests only need a stable identity to key off.
 */
export const editorInfoField = StateField.define<{
	file: { path: string } | null;
}>({
	create: () => ({ file: null }),
	update: (value) => value,
});

// ---------------------------------------------------------------------------
// Locale
// ---------------------------------------------------------------------------

/** Returns the Obsidian UI language. Stubbed to English. */
export function getLanguage(): string {
	return "en";
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

/** Attaches a tooltip to an element. No-op in tests. */
export function setTooltip(el: HTMLElement, tooltip: string): void {
	el.setAttribute("aria-label", tooltip);
}

/** Records the icon name on the element; tests do not need Obsidian's SVG rendering. */
export function setIcon(el: HTMLElement, icon: string): void {
	el.dataset.icon = icon;
}

/** Transient user-facing message. */
export class Notice {
	/**
	 * Every message shown since the last `Notice.reset()`.
	 *
	 * A test that needs to assert on what the plugin told the user reads
	 * this list; the real `Notice` renders into a toast that a test
	 * cannot see.
	 */
	static readonly shown: string[] = [];

	/** Clears the recorded messages. Call this between tests. */
	static reset(): void {
		Notice.shown.length = 0;
	}

	constructor(public message: string | DocumentFragment) {
		Notice.shown.push(typeof message === "string" ? message : (message.textContent ?? ""));
	}
	hide(): void {}
}

/**
 * Debounces a callback. Mirrors the Obsidian helper closely enough for
 * tests: the call is deferred and only the last argument of a burst is
 * used. `resetTimer` is accepted for signature parity.
 */
export function debounce<T extends unknown[], V>(
	cb: (...args: [...T]) => V,
	timeout = 0,
	_resetTimer = false
): (...args: [...T]) => void {
	let timer: ReturnType<typeof setTimeout> | null = null;
	let lastArgs: [...T] | null = null;

	return (...args: [...T]): void => {
		lastArgs = args;
		if (timer !== null) clearTimeout(timer);
		timer = setTimeout(() => {
			timer = null;
			if (lastArgs) cb(...lastArgs);
		}, timeout);
	};
}

// ---------------------------------------------------------------------------
// Base classes
// ---------------------------------------------------------------------------

/** Base class for plugin entry points. */
export class Plugin {
	app: unknown;
	constructor(app?: unknown) {
		this.app = app;
	}
	async loadData(): Promise<unknown> {
		return null;
	}
	async saveData(_data: unknown): Promise<void> {}
	addSettingTab(_tab: unknown): void {}
	registerView(_type: string, _factory: unknown): void {}
	addRibbonIcon(_icon: string, _title: string, _callback: unknown): HTMLElement {
		return document.createElement("div");
	}
	addCommand(_command: unknown): unknown {
		return {};
	}
	registerEvent(_ref: unknown): void {}
	registerMarkdownPostProcessor(_processor: unknown): void {}
	registerEditorExtension(_extension: unknown): void {}
}

// ---------------------------------------------------------------------------
// Vault
// ---------------------------------------------------------------------------

/** A file in the vault. */
export class TAbstractFile {
	path = "";
	name = "";
	parent: TFolder | null = null;
}

/** A folder in the vault. */
export class TFolder extends TAbstractFile {
	children: TAbstractFile[] = [];
}

/** A markdown (or other) file in the vault. */
export class TFile extends TAbstractFile {
	extension = "md";
	basename = "";
	stat = { ctime: 0, mtime: 0, size: 0 };
}

/** Static vault helpers. */
export class Vault {
	/** Recursively walks a folder's children. */
	static recurseChildren(_folder: TFolder, _cb: (file: TAbstractFile) => void): void {}
}

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

export class WorkspaceLeaf {}

export class ItemView {
	containerEl: HTMLElement = document.createElement("div");
	/**
	 * The view's own content area.
	 *
	 * Obsidian's `ItemView` exposes this directly; the plugin used to reach
	 * for `containerEl.children[1]` instead, which depends on Obsidian's
	 * internal view DOM shape.
	 */
	contentEl: HTMLElement = document.createElement("div");
	constructor(public leaf?: WorkspaceLeaf) {
		// Obsidian's view DOM is a container with a header and a content
		// area; `contentEl` is that second child. Keeping the tree here
		// means a test that drives the real view renders into the same
		// element the plugin renders into.
		this.containerEl.appendChild(document.createElement("div"));
		this.containerEl.appendChild(this.contentEl);
	}
	getViewType(): string {
		return "";
	}
	getDisplayText(): string {
		return "";
	}
	getIcon(): string {
		return "";
	}
	async onOpen(): Promise<void> {}
	async onClose(): Promise<void> {}
}

// ---------------------------------------------------------------------------
// Modals & settings
// ---------------------------------------------------------------------------

export class Modal {
	contentEl: HTMLElement = document.createElement("div");
	containerEl: HTMLElement = document.createElement("div");
	modalEl: HTMLElement = document.createElement("div");
	headerEl: HTMLElement = document.createElement("div");
	titleEl: HTMLElement = document.createElement("div");
	constructor(public app?: unknown) {
		// Obsidian's modal DOM is a container wrapping a title and a
		// content area. `ConfirmationModal` puts its button row on
		// `modalEl` (a sibling of `contentEl`), so the tree has to
		// reflect that for a test to assert on the real structure.
		this.headerEl.appendChild(this.titleEl);
		this.modalEl.appendChild(this.headerEl);
		this.modalEl.appendChild(this.contentEl);
		this.containerEl.appendChild(this.modalEl);
	}
	setTitle(title: string): this {
		this.titleEl.textContent = title;
		return this;
	}
	onOpen(): void {}
	onClose(): void {}
	open(): void {
		this.onOpen();
	}
	close(): void {
		this.onClose();
	}
}

/**
 * A stand-in for Obsidian's `ConfirmationModal` (1.13.0).
 *
 * The real class owns a `.modal-button-container` row and appends one
 * button per `addButton()` call. The buttons are recorded here so a test
 * can find them and click them.
 *
 * The behaviours below mirror Obsidian 1.13.4's own implementation, which
 * was read out of `app.js` rather than inferred from the type docs:
 *
 * - The button container is created on `modalEl`, NOT on `contentEl`.
 * - `addButton()` installs a handler that closes the modal *unless* the
 *   callback returns a truthy value (the "keep the modal open" escape
 *   hatch).
 * - `addCancelButton()` routes through `addButton()`, so the cancel
 *   button keeps the default handler and DOES close the modal — it only
 *   overrides the label and the styling.
 */
export class ConfirmationModal extends Modal {
	buttonContainerEl: HTMLElement = document.createElement("div");

	/** The buttons added through `addButton()`, in the order they were added. */
	readonly buttons: ConfirmationButton[] = [];

	constructor(app?: unknown) {
		super(app);
		this.containerEl.classList.add("mod-confirmation");
		// The real implementation creates the row with
		// `modalEl.createDiv("modal-button-container")` — the class is
		// what gives the row Obsidian's own spacing and the rule that
		// pushes a `.mod-secondary` button to the far left.
		this.buttonContainerEl.classList.add("modal-button-container");
		this.modalEl.appendChild(this.buttonContainerEl);
	}

	addClass(cls: string): this {
		this.modalEl.classList.add(cls);
		return this;
	}

	addButton(cb: (btn: ConfirmationButton) => unknown): this {
		const button = new ConfirmationButton(this.buttonContainerEl, () => this.close());
		this.buttons.push(button);
		cb(button);
		return this;
	}

	addCancelButton(text?: string): this {
		// The real implementation routes the cancel button through
		// `addButton()`, so it keeps the default handler that closes the
		// modal — it only overrides the label and the styling.
		return this.addButton((button) => {
			button.setButtonText(text ?? "Cancel").setCancel();
		});
	}
}

export class PluginSettingTab {
	containerEl: HTMLElement = document.createElement("div");
	constructor(public app?: unknown, public plugin?: unknown) {}
	display(): void {}
	update(): void {}
}

/**
 * A functional stand-in for Obsidian's `Setting`.
 *
 * The real `Setting` is a builder: `addText` hands the caller a text
 * component, `addButton` a button component, and so on. The mock keeps
 * that shape — the callbacks are invoked immediately and the created
 * components are recorded on the setting, so a test can reach them
 * through `Setting.created` and drive the setting tab.
 */
export class Setting {
	/** Every setting constructed since the last `Setting.reset()`. */
	static created: Setting[] = [];

	/** Clears the recorded settings. Call this between tests. */
	static reset(): void {
		Setting.created = [];
	}

	settingEl: HTMLElement = document.createElement("div");
	/** The element holding the setting's name and description. */
	infoEl: HTMLElement = document.createElement("div");
	/** The element holding the setting's name. */
	nameEl: HTMLElement = document.createElement("div");
	/** The element holding the setting's description. */
	descEl: HTMLElement = document.createElement("div");
	/** The element holding the setting's control(s). */
	controlEl: HTMLElement = document.createElement("div");
	components: {
		texts: TextComponent[];
		dropdowns: DropdownComponent[];
		colorPickers: ColorComponent[];
		buttons: ButtonComponent[];
	} = { texts: [], dropdowns: [], colorPickers: [], buttons: [] };

	constructor(public containerEl?: HTMLElement) {
		Setting.created.push(this);
		// Obsidian's real DOM nests the name and description inside
		// `.setting-item-info` and keeps the controls in a sibling
		// `.setting-item-control` — the plugin's own CSS targets those
		// two classes, so the stub has to reproduce the structure.
		this.infoEl.appendChild(this.nameEl);
		this.infoEl.appendChild(this.descEl);
		this.settingEl.appendChild(this.infoEl);
		this.settingEl.appendChild(this.controlEl);
		if (containerEl) containerEl.appendChild(this.settingEl);
	}

	setName(name: string): this {
		this.nameEl.textContent = name;
		return this;
	}
	setDesc(desc: string): this {
		this.descEl.textContent = desc;
		return this;
	}
	setClass(cls: string): this {
		// The real implementation splits on whitespace and adds each
		// class separately.
		for (const name of cls.split(" ").filter(Boolean)) {
			this.settingEl.classList.add(name);
		}
		return this;
	}
	setHeading(): this {
		this.settingEl.classList.add("setting-item-heading");
		return this;
	}

	addText(cb: (text: TextComponent) => void): this {
		const component = new TextComponent(this.controlEl);
		this.components.texts.push(component);
		cb(component);
		return this;
	}

	addDropdown(cb: (dropdown: DropdownComponent) => void): this {
		const component = new DropdownComponent(this.controlEl);
		this.components.dropdowns.push(component);
		cb(component);
		return this;
	}

	addColorPicker(cb: (picker: ColorComponent) => void): this {
		const component = new ColorComponent();
		this.components.colorPickers.push(component);
		cb(component);
		return this;
	}

	addButton(cb: (button: ButtonComponent) => void): this {
		const component = new ButtonComponent(this.controlEl);
		this.components.buttons.push(component);
		cb(component);
		return this;
	}

	addToggle(cb: (toggle: unknown) => void): this {
		cb({ setValue: () => undefined, onChange: () => undefined });
		return this;
	}
}

/** A text input component. */
export class TextComponent {
	inputEl: HTMLInputElement = document.createElement("input");
	private changeHandler: ((value: string) => void) | null = null;

	constructor(containerEl?: HTMLElement) {
		this.inputEl.type = "text";
		if (containerEl) containerEl.appendChild(this.inputEl);
	}

	setPlaceholder(placeholder: string): this {
		this.inputEl.placeholder = placeholder;
		return this;
	}
	setValue(value: string): this {
		this.inputEl.value = value;
		return this;
	}
	getValue(): string {
		return this.inputEl.value;
	}
	onChange(cb: (value: string) => void): this {
		this.changeHandler = cb;
		return this;
	}
	/** Simulates the user typing a new value. */
	async setValueFromUser(value: string): Promise<void> {
		this.inputEl.value = value;
		await this.changeHandler?.(value);
	}
}

/** A multi-line text input component. */
export class TextAreaComponent {
	inputEl: HTMLTextAreaElement = document.createElement("textarea");
	private changeHandler: ((value: string) => void) | null = null;

	constructor(containerEl?: HTMLElement) {
		if (containerEl) containerEl.appendChild(this.inputEl);
	}

	setPlaceholder(placeholder: string): this {
		this.inputEl.placeholder = placeholder;
		return this;
	}
	setValue(value: string): this {
		this.inputEl.value = value;
		return this;
	}
	getValue(): string {
		return this.inputEl.value;
	}
	onChange(cb: (value: string) => void): this {
		this.changeHandler = cb;
		return this;
	}
	/** Simulates the user typing a new value. */
	async setValueFromUser(value: string): Promise<void> {
		this.inputEl.value = value;
		await this.changeHandler?.(value);
	}
}

/** A dropdown component. */
export class DropdownComponent {
	/**
	 * The `<select>` the component drives.
	 *
	 * The real `DropdownComponent` builds a `<select class="dropdown">` and
	 * appends an `<option>` per `addOption()` call. The stub keeps the
	 * options in the DOM so a test can assert on the control's real value
	 * and option list.
	 */
	selectEl: HTMLSelectElement = document.createElement("select");

	/**
	 * The hidden `<select>` the real component uses to measure the widest
	 * option and size the visible one to fit.
	 *
	 * Obsidian creates it as a sibling of `selectEl` with
	 * `class="dropdown is-measuring"` and `aria-hidden="true"`; it is
	 * kept here so the stub's DOM matches the real one.
	 */
	measureEl: HTMLSelectElement = document.createElement("select");

	/** The single `<option>` inside `measureEl`. */
	measureOptionEl: HTMLOptionElement = document.createElement("option");

	private changeHandler: ((value: string) => void) | null = null;

	constructor(containerEl?: HTMLElement) {
		this.selectEl.className = "dropdown";
		this.measureEl.className = "dropdown is-measuring";
		this.measureEl.setAttribute("aria-hidden", "true");
		this.measureEl.appendChild(this.measureOptionEl);
		if (containerEl) {
			containerEl.appendChild(this.selectEl);
			containerEl.appendChild(this.measureEl);
		}
	}

	addOption(value: string, label: string): this {
		const option = document.createElement("option");
		option.value = value;
		option.textContent = label;
		this.selectEl.appendChild(option);
		return this;
	}

	setValue(value: string): this {
		this.selectEl.value = value;
		return this;
	}

	getValue(): string {
		return this.selectEl.value;
	}

	onChange(cb: (value: string) => void): this {
		this.changeHandler = cb;
		return this;
	}

	/** Simulates the user picking a different option. */
	async selectValue(value: string): Promise<void> {
		this.selectEl.value = value;
		await this.changeHandler?.(value);
	}
}

/** A colour picker component. */
export class ColorComponent {
	private changeHandler: ((value: string) => void) | null = null;

	setValue(_value: string): this {
		return this;
	}
	onChange(cb: (value: string) => void): this {
		this.changeHandler = cb;
		return this;
	}
	/** Simulates the user picking a different colour. */
	async pickColor(value: string): Promise<void> {
		await this.changeHandler?.(value);
	}
}

/** An icon-only button (Obsidian's `ExtraButtonComponent`). */
export class ExtraButtonComponent {
	extraSettingsEl: HTMLElement = document.createElement("div");
	private clickHandler: ((evt: MouseEvent) => unknown) | null = null;

	constructor(containerEl?: HTMLElement) {
		if (containerEl) containerEl.appendChild(this.extraSettingsEl);
	}

	setIcon(icon: string): this {
		this.extraSettingsEl.setAttribute("data-icon", icon);
		return this;
	}

	setTooltip(tooltip: string): this {
		this.extraSettingsEl.setAttribute("aria-label", tooltip);
		return this;
	}

	onClick(cb: (evt: MouseEvent) => unknown): this {
		this.clickHandler = cb;
		this.extraSettingsEl.addEventListener("click", (evt) => {
			void this.clickHandler?.(evt);
		});
		return this;
	}

	/** Simulates the user clicking the button. */
	async click(): Promise<void> {
		await this.clickHandler?.(new MouseEvent("click"));
	}
}

/** A progress bar component (a single 0-100 value). */
export class ProgressBarComponent {
	private value = 0;

	constructor(containerEl?: HTMLElement) {
		if (containerEl) containerEl.appendChild(document.createElement("div"));
	}

	setValue(value: number): this {
		this.value = value;
		return this;
	}

	getValue(): number {
		return this.value;
	}
}

/**
 * A button component.
 *
 * Mirrors Obsidian 1.13.4's `ButtonComponent`: the `<button>` is created
 * inside the container it is given, the click listener is attached once
 * in the constructor, and `onClick()` only swaps the callback that
 * listener invokes.
 */
export class ButtonComponent {
	/** The button element this component drives. */
	buttonEl: HTMLButtonElement = document.createElement("button");

	/** The button's text content. */
	private text = "";

	private clickHandler: ((evt: MouseEvent) => unknown) | null = null;

	constructor(containerEl?: HTMLElement) {
		if (containerEl) containerEl.appendChild(this.buttonEl);
		this.buttonEl.addEventListener("click", (evt) => {
			void this.clickHandler?.(evt);
		});
	}

	setButtonText(text: string): this {
		this.text = text;
		this.buttonEl.textContent = text;
		return this;
	}

	/** The button's current text. */
	getButtonText(): string {
		return this.text;
	}

	setWarning(): this {
		// Obsidian 1.13.4 implements `setWarning()` as
		// `setDestructive().setCta()`, so the button carries BOTH
		// `mod-destructive` and `mod-cta`.
		return this.setDestructive().setCta();
	}

	setCta(): this {
		this.buttonEl.classList.add("mod-cta");
		return this;
	}

	setDestructive(): this {
		this.buttonEl.classList.add("mod-destructive");
		return this;
	}

	removeDestructive(): this {
		this.buttonEl.classList.remove("mod-destructive");
		return this;
	}

	setIcon(icon: string): this {
		this.buttonEl.setAttribute("data-icon", icon);
		return this;
	}

	setTooltip(tooltip: string): this {
		this.buttonEl.setAttribute("aria-label", tooltip);
		return this;
	}

	setClass(cls: string): this {
		this.buttonEl.classList.add(cls);
		return this;
	}

	setDisabled(disabled: boolean): this {
		this.buttonEl.disabled = disabled;
		return this;
	}

	onClick(cb: (evt: MouseEvent) => unknown): this {
		this.clickHandler = cb;
		return this;
	}

	/** Simulates the user clicking the button. */
	async click(): Promise<void> {
		await this.clickHandler?.(new MouseEvent("click"));
	}
}

/**
 * A button inside a `ConfirmationModal`'s button row.
 *
 * `ConfirmationButton` extends `ButtonComponent` in the real API, so the
 * stub does the same. The extra behaviour mirrors Obsidian 1.13.4's
 * implementation:
 *
 * - The constructor installs a DEFAULT handler that closes the modal, so
 *   a button that never gets an explicit handler (the cancel button)
 *   still closes it.
 * - `onClick(handler)` REPLACES that default with the caller's handler
 *   and awaits it, closing the modal afterwards unless the handler
 *   returned a truthy value.
 */
export class ConfirmationButton extends ButtonComponent {
	private handleClose: () => void = () => {};

	constructor(containerEl?: HTMLElement, handleClose?: () => void) {
		super(containerEl);
		this.handleClose = handleClose ?? (() => {});
		super.onClick(() => this.handleClose());
	}

	setInitialFocus(): this {
		return this;
	}

	setSecondary(): this {
		this.buttonEl.classList.add("mod-secondary");
		return this;
	}

	setCancel(): this {
		this.buttonEl.classList.add("mod-cancel");
		return this;
	}

	onClick(cb: (evt: MouseEvent) => unknown): this {
		super.onClick(async (evt) => {
			const result = await cb(evt);
			if (!result) this.handleClose();
		});
		return this;
	}
}

export class AbstractInputSuggest<T> {
	constructor(public app?: unknown, public inputEl?: HTMLInputElement) {}
	getSuggestions(_query: string): T[] {
		return [];
	}
	renderSuggestion(_item: T, _el: HTMLElement): void {}
	onSelect(_cb: (item: T) => void): this {
		return this;
	}
	setValue(_value: string): void {}
	close(): void {}
}

export class App {}
