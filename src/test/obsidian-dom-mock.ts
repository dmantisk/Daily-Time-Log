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
		options?: DomElementInfoLike
	): HTMLElementTagNameMap[K] {
		const el = this.ownerDocument.createElement(tag);
		if (options?.text !== undefined) {
			if (typeof options.text === "string") {
				el.textContent = options.text;
			} else {
				el.appendChild(options.text);
			}
		}
		if (options?.cls) {
			el.className = Array.isArray(options.cls) ? options.cls.join(" ") : options.cls;
		}
		if (options?.title) el.setAttribute("title", options.title);
		if (options?.value !== undefined) {
			// `value` is a real `DomElementInfo` field — Obsidian applies it
			// to the element's VALUE PROPERTY, not as an attribute. That
			// distinction matters for `<option value="30">`: the select's
			// `value` is read from the option's value, and a select with
			// no value-bearing option falls back to the option's TEXT.
			(el as unknown as { value: string }).value = options.value;
		}
		if (options?.type) el.setAttribute("type", options.type);
		if (options?.href) el.setAttribute("href", options.href);
		if (options?.placeholder) el.setAttribute("placeholder", options.placeholder);
		if (options?.attr) {
			for (const [name, value] of Object.entries(options.attr)) {
				if (value === null) el.removeAttribute(name);
				else el.setAttribute(name, String(value));
			}
		}
		const parent = options?.parent ?? this;
		if (options?.prepend) parent.insertBefore(el, parent.firstChild);
		else parent.appendChild(el);
		return el;
	};

	proto.createDiv = function (this: HTMLElement, options?: DomElementInfoLike): HTMLDivElement {
		return this.createEl("div", options);
	};

	proto.createSpan = function (this: HTMLElement, options?: DomElementInfoLike): HTMLSpanElement {
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
		options?: DomElementInfoLike
	): HTMLElementTagNameMap[K];
	createDiv(options?: DomElementInfoLike): HTMLDivElement;
	createSpan(options?: DomElementInfoLike): HTMLSpanElement;
	addClass(...classes: string[]): void;
	removeClass(...classes: string[]): void;
	toggleClass(classes: string | string[], value: boolean): void;
	hasClass(cls: string): boolean;
	setText(text: string): void;
	setCssStyles(styles: Record<string, string>): void;
	setAttr(name: string, value: string | number | boolean): void;
}

/**
 * The subset of Obsidian's `DomElementInfo` the DOM helpers accept.
 *
 * Kept as a local interface rather than importing Obsidian's global
 * namespace type so this test helper stays free of the types-only
 * `obsidian` package at runtime.
 */
interface DomElementInfoLike {
	text?: string | DocumentFragment;
	cls?: string | string[];
	attr?: Record<string, string | number | boolean | null>;
	title?: string;
	value?: string;
	type?: string;
	prepend?: boolean;
	placeholder?: string;
	href?: string;
	parent?: Node;
}
