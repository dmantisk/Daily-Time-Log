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
	close(): void {}
}

export class PluginSettingTab {
	containerEl: HTMLElement = document.createElement("div");
	constructor(public app?: unknown, public plugin?: unknown) {}
	display(): void {}
}

export class Setting {
	constructor(public containerEl?: HTMLElement) {}
	setName(_name: string): this {
		return this;
	}
	setDesc(_desc: string): this {
		return this;
	}
	setHeading(): this {
		return this;
	}
	addText(_cb: (text: unknown) => void): this {
		return this;
	}
	addDropdown(_cb: (dropdown: unknown) => void): this {
		return this;
	}
	addToggle(_cb: (toggle: unknown) => void): this {
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
