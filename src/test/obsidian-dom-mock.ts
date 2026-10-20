/**
 * Minimal stand-ins for the DOM helpers Obsidian adds to the
 * `HTMLElement` prototype (`createEl`, `createDiv`, `empty`, …).
 *
 * Obsidian augments the built-in DOM types with a small set of
 * convenience methods, and the settings tab uses them heavily. Without
 * them the settings tab cannot be rendered in a test at all.
 *
 * This module is TEST SUPPORT ONLY — it installs the helpers onto the
 * global `HTMLElement` prototype and is never imported by production
 * code.
 */

/** Installs the Obsidian-style DOM helpers on the global HTMLElement. */
export function installObsidianDomHelpers(): void {
	const proto = globalThis.HTMLElement?.prototype as ObsidianElementProto | undefined;
	if (!proto || proto.__dwlObsidianDomInstalled) return;

	proto.empty = function (this: HTMLElement): void {
		while (this.firstChild) this.removeChild(this.firstChild);
	};

	proto.createEl = function <K extends keyof HTMLElementTagNameMap>(
		this: HTMLElement,
		tag: K,
		options?: { text?: string; cls?: string; attr?: Record<string, string>; title?: string }
	): HTMLElementTagNameMap[K] {
		const el = this.ownerDocument.createElement(tag);
		if (options?.text !== undefined) el.textContent = options.text;
		if (options?.cls) el.className = options.cls;
		if (options?.title) el.setAttribute("title", options.title);
		if (options?.attr) {
			for (const [name, value] of Object.entries(options.attr)) el.setAttribute(name, value);
		}
		this.appendChild(el);
		return el;
	};

	proto.createDiv = function (
		this: HTMLElement,
		options?: { text?: string; cls?: string; attr?: Record<string, string> }
	): HTMLDivElement {
		return this.createEl("div", options);
	};

	proto.createSpan = function (
		this: HTMLElement,
		options?: { text?: string; cls?: string; attr?: Record<string, string> }
	): HTMLSpanElement {
		return this.createEl("span", options);
	};

	proto.addClass = function (this: HTMLElement, ...classes: string[]): void {
		this.classList.add(...classes);
	};

	proto.removeClass = function (this: HTMLElement, ...classes: string[]): void {
		this.classList.remove(...classes);
	};

	proto.toggleClass = function (this: HTMLElement, classes: string | string[], value: boolean): void {
		for (const cls of Array.isArray(classes) ? classes : [classes]) {
			this.classList.toggle(cls, value);
		}
	};

	proto.hasClass = function (this: HTMLElement, cls: string): boolean {
		return this.classList.contains(cls);
	};

	proto.setText = function (this: HTMLElement, text: string): void {
		this.textContent = text;
	};

	proto.setCssStyles = function (this: HTMLElement, styles: Record<string, string>): void {
		for (const [name, value] of Object.entries(styles)) {
			this.style.setProperty(name, value);
		}
	};

	proto.setAttr = function (this: HTMLElement, name: string, value: string | number | boolean): void {
		this.setAttribute(name, String(value));
	};

	Object.defineProperty(proto, "__dwlObsidianDomInstalled", {
		value: true,
		enumerable: false,
	});
}

interface ObsidianElementProto {
	__dwlObsidianDomInstalled?: boolean;
	empty(): void;
	createEl<K extends keyof HTMLElementTagNameMap>(
		tag: K,
		options?: { text?: string; cls?: string; attr?: Record<string, string>; title?: string }
	): HTMLElementTagNameMap[K];
	createDiv(options?: { text?: string; cls?: string; attr?: Record<string, string> }): HTMLDivElement;
	createSpan(options?: { text?: string; cls?: string; attr?: Record<string, string> }): HTMLSpanElement;
	addClass(...classes: string[]): void;
	removeClass(...classes: string[]): void;
	toggleClass(classes: string | string[], value: boolean): void;
	hasClass(cls: string): boolean;
	setText(text: string): void;
	setCssStyles(styles: Record<string, string>): void;
	setAttr(name: string, value: string | number | boolean): void;
}
