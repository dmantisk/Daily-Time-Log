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

// ---------------------------------------------------------------------------
// CodeMirror / editor bridge
// ---------------------------------------------------------------------------

/**
 * State field carrying the editor's file info. `categoryBadges.ts` reads it
 * to learn the active file path. The real implementation is a CodeMirror
 * `StateField`; tests only need a stable identity to key off.
 */
export const editorInfoField = { name: "editorInfoField" } as unknown as {
	name: string;
	init: (value: unknown) => unknown;
	of: (value: unknown) => unknown;
};

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

/** Transient user-facing message. No-op in tests. */
export class Notice {
	constructor(public message: string | DocumentFragment) {}
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
	constructor(public leaf?: WorkspaceLeaf) {}
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
	titleEl: HTMLElement = document.createElement("div");
	constructor(public app?: unknown) {}
	onOpen(): void {}
	onClose(): void {}
	open(): void {
		this.onOpen();
	}
	close(): void {
		this.onClose();
	}
}

export class PluginSettingTab {
	containerEl: HTMLElement = document.createElement("div");
	constructor(public app?: unknown, public plugin?: unknown) {}
	display(): void {}
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
	components: {
		texts: TextComponent[];
		dropdowns: DropdownComponent[];
		colorPickers: ColorComponent[];
		buttons: ButtonComponent[];
	} = { texts: [], dropdowns: [], colorPickers: [], buttons: [] };

	constructor(public containerEl?: HTMLElement) {
		Setting.created.push(this);
	}

	setName(_name: string): this {
		return this;
	}
	setDesc(_desc: string): this {
		return this;
	}
	setHeading(): this {
		return this;
	}

	addText(cb: (text: TextComponent) => void): this {
		const component = new TextComponent();
		this.components.texts.push(component);
		cb(component);
		return this;
	}

	addDropdown(cb: (dropdown: DropdownComponent) => void): this {
		const component = new DropdownComponent();
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
		const component = new ButtonComponent();
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
	private changeHandler: ((value: string) => void) | null = null;

	addOption(_value: string, _label: string): this {
		return this;
	}
	setValue(_value: string): this {
		return this;
	}
	onChange(cb: (value: string) => void): this {
		this.changeHandler = cb;
		return this;
	}
	/** Simulates the user picking a different option. */
	async selectValue(value: string): Promise<void> {
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

/** A button component. */
export class ButtonComponent {
	private clickHandler: (() => void) | null = null;

	setButtonText(_text: string): this {
		return this;
	}
	setWarning(): this {
		return this;
	}
	setCta(): this {
		return this;
	}
	onClick(cb: () => void): this {
		this.clickHandler = cb;
		return this;
	}
	/** Simulates the user clicking the button. */
	async click(): Promise<void> {
		await this.clickHandler?.();
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
