/**
 * Category badge rendering for the note editor and reading view.
 *
 * Finds `[Category]` tokens in daily notes (same format that parser.ts reads)
 * and replaces them with styled pill badges whose background color matches the
 * plugin's configured category list. Falls back to a neutral grey badge for
 * tokens that don't match any configured category.
 *
 * Two surfaces are covered:
 *   1. Reading view  — via registerMarkdownPostProcessor (static HTML render)
 *   2. Live editor   — via a CodeMirror ViewPlugin using MatchDecorator
 *
 * Scoped to daily notes only: a file must be inside the configured
 * `dailyNoteFolder` AND have a valid YYYY-MM-DD basename (checked via
 * parseDateFromBasename from dailyNote.ts). Files outside that scope are
 * left completely untouched.
 *
 * No Obsidian API is called from this module directly — the plugin class
 * in main.ts owns the registration lifecycle.
 */

import { MarkdownPostProcessorContext } from "obsidian";
import {
	Decoration,
	DecorationSet,
	EditorView,
	MatchDecorator,
	ViewPlugin,
	ViewUpdate,
	WidgetType,
} from "@codemirror/view";
import { editorInfoField } from "obsidian";
import { parseDateFromBasename, isInDailyNoteFolder } from "./dailyNote";
import { getTextColorForBackground } from "./components/colorUtils";
import { CATEGORY_BADGE_REGEX_SOURCE } from "./parser";
import type { CustomCategory } from "./settings";

export { CATEGORY_BADGE_REGEX_SOURCE };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns whether a vault-relative file path corresponds to a daily note
 * (inside the configured folder AND a valid YYYY-MM-DD basename).
 */
function isDailyNoteFile(filePath: string, dailyNoteFolder: string): boolean {
	if (!isInDailyNoteFolder(filePath, dailyNoteFolder)) return false;
	const basename = filePath.split("/").pop()?.replace(/\.md$/, "") ?? "";
	return parseDateFromBasename(basename) !== null;
}

/**
 * Finds the configured category whose displayName matches the token text
 * (case-insensitive, trimmed). Returns `undefined` when there's no match —
 * the caller renders a neutral fallback badge.
 */
function findCategory(
	token: string,
	categories: CustomCategory[]
): CustomCategory | undefined {
	const lower = token.trim().toLowerCase();
	return categories.find((c) => c.displayName.trim().toLowerCase() === lower);
}

/**
 * Builds a badge `<span>` element for the given category token. Inline
 * styles carry the background and text colors so the badge looks right
 * regardless of what CSS snippets or themes are active. A CSS class is
 * also added so users can further override via their own snippets if they
 * want to.
 */
function makeBadgeSpan(token: string, categories: CustomCategory[]): HTMLSpanElement {
	const cat = findCategory(token, categories);
	const bg = cat?.color ?? "#e2e8f0";
	const fg = getTextColorForBackground(bg);

	const span = document.createElement("span");
	span.className = `dwl-cat-badge dwl-cat-badge--${token.trim().toLowerCase().replace(/[\s]+/g, "-")}`;
	span.textContent = token;
	span.style.backgroundColor = bg;
	span.style.color = fg;
	return span;
}

// ---------------------------------------------------------------------------
// CodeMirror WidgetType (live editor)
// ---------------------------------------------------------------------------

class CategoryBadgeWidget extends WidgetType {
	constructor(
		private readonly token: string,
		private readonly categories: CustomCategory[]
	) {
		super();
	}

	eq(other: CategoryBadgeWidget): boolean {
		// Re-use the widget if the token text is the same.
		// Category color changes (settings save) rebuild the entire view plugin,
		// so stale colour state is not a concern here.
		return other.token === this.token;
	}

	toDOM(): HTMLElement {
		return makeBadgeSpan(this.token, this.categories);
	}

	/** Keep the widget in sync with cursor movement (no extra reflow). */
	ignoreEvent(): boolean {
		return false;
	}
}

// ---------------------------------------------------------------------------
// CodeMirror ViewPlugin factory (live editor)
// ---------------------------------------------------------------------------

/**
 * Creates (and returns) a CodeMirror ViewPlugin that decorates `[Category]`
 * tokens in the live editor with badge widgets, limited to daily notes in the
 * configured folder. A new plugin instance is created every time the settings
 * change so the category colour lookup is always fresh.
 */
export function buildCategoryBadgeEditorPlugin(
	categories: CustomCategory[],
	dailyNoteFolder: string
) {
	const matcher = new MatchDecorator({
		regexp: new RegExp(CATEGORY_BADGE_REGEX_SOURCE, "g"),
		decoration: (match) => {
			// Only render a badge when the token matches a configured category.
			// Unknown `[...]` tokens (typos, prose, wikilinks) stay as plain text.
			if (!findCategory(match[1], categories)) return null;
			return Decoration.replace({
				widget: new CategoryBadgeWidget(match[1], categories),
			});
		},
	});

	return ViewPlugin.define(
		(view: EditorView) => {
			// Resolve the file path at plugin construction time and cache the
			// scope decision — it doesn't change while the editor is open.
			const info = view.state.field(editorInfoField, false);
			const filePath = info?.file?.path ?? null;
			const inScope = filePath !== null && isDailyNoteFile(filePath, dailyNoteFolder);

			return {
				inScope,
				decorations: inScope ? matcher.createDeco(view) : Decoration.none,
				update(update: ViewUpdate) {
					if (!this.inScope) return;
					this.decorations = matcher.updateDeco(update, this.decorations);
				},
			};
		},
		{ decorations: (v) => v.decorations as DecorationSet }
	);
}

// ---------------------------------------------------------------------------
// Reading-view post-processor
// ---------------------------------------------------------------------------

/**
 * Markdown post-processor for the Reading view. Walks all text nodes inside
 * the rendered HTML, finds `[Category]` tokens, and replaces them with badge
 * spans — exactly the same algorithm as the standalone category-badges plugin,
 * but using plugin-configured colors instead of generic CSS class names.
 */
export function processCategoryBadgesInReadingView(
	el: HTMLElement,
	ctx: MarkdownPostProcessorContext,
	categories: CustomCategory[],
	dailyNoteFolder: string
): void {
	if (!isDailyNoteFile(ctx.sourcePath, dailyNoteFolder)) return;

	const regex = new RegExp(CATEGORY_BADGE_REGEX_SOURCE, "g");
	const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
	const targets: Text[] = [];

	let node: Node | null;
	while ((node = walker.nextNode())) {
		// Skip text already inside a badge span (avoid double-processing).
		if (
			node.parentElement &&
			node.parentElement.classList.contains("dwl-cat-badge")
		)
			continue;
		regex.lastIndex = 0;
		if (regex.test((node as Text).textContent ?? "")) {
			targets.push(node as Text);
		}
	}

	targets.forEach((textNode) => {
		const text = textNode.textContent ?? "";
		const frag = document.createDocumentFragment();
		let lastIndex = 0;
		let match: RegExpExecArray | null;
		regex.lastIndex = 0;

		while ((match = regex.exec(text))) {
			// Plain text before this match
			if (match.index > lastIndex) {
				frag.appendChild(
					document.createTextNode(text.slice(lastIndex, match.index))
				);
			}
			// Only render a badge when the token matches a configured category.
			// Unknown `[...]` tokens stay as plain text in the reading view.
			if (findCategory(match[1], categories)) {
				frag.appendChild(makeBadgeSpan(match[1], categories));
			} else {
				frag.appendChild(document.createTextNode(match[0]));
			}
			lastIndex = regex.lastIndex;
		}

		// Remaining plain text after the last match
		if (lastIndex < text.length) {
			frag.appendChild(document.createTextNode(text.slice(lastIndex)));
		}

		textNode.parentNode?.replaceChild(frag, textNode);
	});
}
