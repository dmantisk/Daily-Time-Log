/**
 * @vitest-environment happy-dom
 *
 * Fidelity of the Obsidian DOM-helper mock.
 *
 * The mock stands in for the helpers Obsidian adds to the
 * `HTMLElement` prototype. When it drifts from the real API, a test
 * can pass or fail for the wrong reason: the mock silently drops a
 * field, the rendered DOM is not what Obsidian would produce, and the
 * test asserts on the wrong thing.
 *
 * One such drift was found by a visual preview of the dashboard: the
 * mock ignored `createEl("option", { value })`, so the dashboard's
 * window dropdown reported the option's TEXT instead of its value and
 * the preview showed "Last 7 Days" selected while the metrics said
 * "Event Time (30)".
 */

import { describe, expect, it } from "vitest";
import { installObsidianDomHelpers } from "./obsidian-dom-mock";

installObsidianDomHelpers();

describe("obsidian-dom-mock createEl", () => {
	it("applies text, cls and title", () => {
		const parent = document.createElement("div");
		const el = parent.createEl("span", { text: "hello", cls: "a b", title: "tip" });
		expect(el.textContent).toBe("hello");
		expect(el.className).toBe("a b");
		expect(el.getAttribute("title")).toBe("tip");
	});

	it("applies a class array", () => {
		const parent = document.createElement("div");
		const el = parent.createDiv({ cls: ["one", "two"] });
		expect(el.className).toBe("one two");
	});

	it("applies value to the element's value, so a select reads it back", () => {
		const select = document.createElement("select");
		select.createEl("option", { text: "Last 7 Days", value: "7" });
		select.createEl("option", { text: "Last 30 Days", value: "30" });
		expect(select.value).toBe("7");
		expect([...select.options].map((o) => o.value)).toEqual(["7", "30"]);
	});

	it("applies value as a property, not an attribute", () => {
		const parent = document.createElement("div");
		const el = parent.createEl("option", { value: "30" });
		expect((el as HTMLOptionElement).value).toBe("30");
	});

	it("applies attr entries, and removes attributes for null values", () => {
		const parent = document.createElement("div");
		const el = parent.createEl("div", { attr: { "data-x": "1", "data-y": null } });
		expect(el.getAttribute("data-x")).toBe("1");
		expect(el.hasAttribute("data-y")).toBe(false);
	});

	it("appends by default and prepends on request", () => {
		const parent = document.createElement("div");
		parent.createEl("span", { text: "first" });
		parent.createEl("span", { text: "second" });
		parent.createEl("span", { text: "zero", prepend: true });
		expect([...parent.children].map((c) => c.textContent)).toEqual(["zero", "first", "second"]);
	});

	it("appends a DocumentFragment as text", () => {
		const parent = document.createElement("div");
		const frag = document.createDocumentFragment();
		frag.appendChild(document.createTextNode("frag"));
		const el = parent.createEl("div", { text: frag });
		expect(el.textContent).toBe("frag");
	});
});
