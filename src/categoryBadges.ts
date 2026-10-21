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
 * Additionally scoped to the Event block: badges are only rendered for
 * lines inside the configured Event heading's section (see parser.ts), so
 * a `[Category]` token typed outside that section stays plain text — the
 * same strict scoping the parser itself applies to Event lines.
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
import { isDailyNoteFileName, isInDailyNoteFolder } from "./dailyNote";
import { getTextColorForBackground } from "./components/colorUtils";
import {
	CATEGORY_BADGE_REGEX_SOURCE,
	DEFAULT_EVENT_HEADING,
	findEventBlockInContent,
	isWithinEventHeading,
	normalizeRenderedHeadingText,
	type EventHeadingConfig,
	type HeadingInfo,
} from "./parser";
import type { CustomCategory } from "./settings";
import { findCategoryByDisplayName } from "./settings";

export { CATEGORY_BADGE_REGEX_SOURCE };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns whether a vault-relative file path corresponds to a daily note
 * (inside the configured folder AND a valid YYYY-MM-DD Markdown file name).
 */
function isDailyNoteFile(filePath: string, dailyNoteFolder: string): boolean {
	if (!isInDailyNoteFolder(filePath, dailyNoteFolder)) return false;
	const fileName = filePath.split("/").pop() ?? "";
	return isDailyNoteFileName(fileName);
}

/**
 * Finds the configured category whose displayName matches the token text
 * (case-insensitive, trimmed). Returns `undefined` when there's no match —
 * the caller renders a neutral fallback badge.
 *
 * Shares `findCategoryByDisplayName` with the sidebar and the dashboard so
 * all three resolve a category token the same way.
 */
function findCategory(
	token: string,
	categories: CustomCategory[]
): CustomCategory | undefined {
	return findCategoryByDisplayName(categories, token);
}

/**
 * Builds a badge `<span>` element for the given category token. Configured
 * category colors are explicit user data; unconfigured tokens inherit the
 * theme-aware fallback styles from CSS.
 */
function makeBadgeSpan(token: string, categories: CustomCategory[]): HTMLSpanElement {
	const cat = findCategory(token, categories);
	const span = document.createElement("span");
	span.className = `dwl-cat-badge dwl-cat-badge--${token.trim().toLowerCase().replace(/[\s]+/g, "-")}`;
	span.textContent = token;
	if (cat) {
		span.style.backgroundColor = cat.color;
		span.style.color = getTextColorForBackground(cat.color);
	}
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
 * configured folder AND to lines inside the configured Event block. A new
 * plugin instance is created every time the settings change so the category
 * colour lookup is always fresh.
 */
export function buildCategoryBadgeEditorPlugin(
	categories: CustomCategory[],
	dailyNoteFolder: string,
	eventHeading: EventHeadingConfig = DEFAULT_EVENT_HEADING
) {
	const matcher = new MatchDecorator({
		regexp: new RegExp(CATEGORY_BADGE_REGEX_SOURCE, "g"),
		decoration: (match, view, pos) => {
			// Only render a badge when the token matches a configured category.
			// Unknown `[...]` tokens (typos, prose, wikilinks) stay as plain text.
			if (!findCategory(match[1], categories)) return null;
			// Strict scoping: the token must sit inside the Event block, so a
			// `[Category]` typed outside the configured heading stays plain text.
			if (!isInsideEventBlock(view, pos, eventHeading)) return null;
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

/**
 * True when the character offset `pos` sits inside the configured Event
 * block of the document currently in the editor.
 *
 * The block is recomputed from the document text on every match — the
 * editor's content changes on every keystroke, so caching a block range
 * would go stale the moment the user edits a heading. The document is
 * small (a daily note), so the linear scan is cheap.
 */
function isInsideEventBlock(
	view: EditorView,
	pos: number,
	eventHeading: EventHeadingConfig
): boolean {
	const text = view.state.doc.toString();
	const block = findEventBlockInContent(text, eventHeading);
	if (!block) return false;

	// CodeMirror positions are absolute character offsets; the block range is
	// expressed in line indices. Convert the match position to a line index
	// (CodeMirror's `lineAt` is 1-based, the block's is 0-based).
	const line = view.state.doc.lineAt(pos).number - 1;

	return line >= block.start && line <= block.end;
}

// ---------------------------------------------------------------------------
// Reading-view post-processor
// ---------------------------------------------------------------------------

/**
 * Walks `root` in document order, reporting every heading element and
 * every text node in the order they appear in the document.
 *
 * A single traversal serves both purposes: the heading sequence is built
 * incrementally, so at the moment a text node is reported, the accumulated
 * headings are exactly the ones that PRECEDE it. That is what the scoping
 * rule needs, and doing it in one pass avoids re-walking the document for
 * every text node.
 *
 * Note that headings and text nodes are interleaved by the walker, so the
 * heading element is reported before the text it contains.
 */
function walkDocumentOrder(
	root: HTMLElement,
	onHeading: (heading: HeadingInfo) => void,
	onText: (node: Text) => void
): void {
	const walker = document.createTreeWalker(
		root,
		NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT
	);

	let current: Node | null;
	while ((current = walker.nextNode())) {
		if (current.nodeType === Node.TEXT_NODE) {
			onText(current as Text);
			continue;
		}
		const level = headingLevelOfElement(current);
		if (level !== null) {
			// The DOM already holds the RENDERED heading text, so only
			// whitespace is normalized here — inline markup has already been
			// rendered away by the Markdown renderer.
			onHeading({
				level,
				text: normalizeRenderedHeadingText(current.textContent ?? ""),
			});
		}
	}
}

/**
 * Returns the heading depth (1-6) of a rendered heading element, or null if
 * the element is not a heading. Obsidian renders Markdown headings as
 * `<h1>`–`<h6>` in the reading view.
 */
function headingLevelOfElement(el: Node): number | null {
	if (el.nodeType !== Node.ELEMENT_NODE) return null;
	const match = /^H([1-6])$/i.exec((el as Element).tagName);
	return match ? Number(match[1]) : null;
}

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
	dailyNoteFolder: string,
	eventHeading: EventHeadingConfig = DEFAULT_EVENT_HEADING
): void {
	if (!isDailyNoteFile(ctx.sourcePath, dailyNoteFolder)) return;

	const regex = new RegExp(CATEGORY_BADGE_REGEX_SOURCE, "g");
	const targets: Text[] = [];

	// Single document-order pass. `headings` accumulates every heading seen
	// SO FAR, so when a text node is reached the accumulated list is exactly
	// the set of headings that precede it — which is what the scoping rule
	// needs to locate the Event section and its end.
	const headings: HeadingInfo[] = [];

	walkDocumentOrder(
		el,
		(heading) => {
			headings.push(heading);
		},
		(node) => {
			// Skip text already inside a badge span (avoid double-processing).
			if (
				node.parentElement &&
				node.parentElement.classList.contains("dwl-cat-badge")
			)
				return;
			// Strict scoping: only text inside the configured Event section is
			// eligible for badge rendering.
			if (!isWithinEventHeading(headings, eventHeading)) return;
			regex.lastIndex = 0;
			if (regex.test(node.textContent ?? "")) {
				targets.push(node);
			}
		}
	);

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
