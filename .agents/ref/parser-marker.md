# Parser rules - marker (§1.3)

## 1.3 Event Block Marker (Single Configurable Heading)

The Event block is identified by **one user-configured heading** (`eventHeadingText` + `eventHeadingLevel` in Settings), not by a generic `---` divider (a `---` divider was rejected because it collides with YAML frontmatter's closing delimiter).

> [!IMPORTANT]
> **Only the configured heading is recognized.** The parser has NO hard-coded fallback list of historical spellings — there is no `LEGACY_EVENT_HEADINGS` equivalent. A heading that does not match the configured text *and* level is ordinary note content.
> - Consequence: if the user changes the Event heading in Settings, notes written with the previous heading stop being treated as an Event block **entirely** — they yield zero events (there is NO whole-body fallback; see 1.7). This is intentional — the configured heading is the single source of truth.
> - Because matching is by exact text, a user's own unrelated heading can only collide if it is literally the configured text at the configured level. The user chose that text, so this is the intended target, not a guess.
> - This plugin does not scaffold new notes (see 3. Obsidian API Best Practices), so there is no "creation side" to keep in sync. The first line of defense is the user's own Daily Notes template containing the configured heading.

**Matching rules**:
- The heading must have **exactly** the configured level (`#` repeated `eventHeadingLevel` times, 1–6) followed by the configured text. A different level is NOT a match, even with the same text.
- Matching MUST be tolerant of accidental hand-typing: trim surrounding whitespace and match case-insensitively (e.g. `# event` still matches a configured `Event`).
- The heading text is matched as a literal string — regex metacharacters in it are escaped, not interpreted.
- **Heading text is normalized to its RENDERED form before comparison** (`normalizeHeadingText` in `parser.ts`). The reading view renders inline markup, so `# **Event**` becomes `<h1>Event</h1>`; if the parser compared the raw text it would disagree with the DOM. Normalization removes emphasis/strong/strikethrough markers, unwraps inline code, **replaces inline links with their label text** (`[Event](url)` -> `Event`), **removes inline images entirely** (`![Event](url)` -> `""`), drops the ATX closing sequence (`# Event #`), decodes HTML entities, and collapses whitespace. The *configured* text is normalized the same way, so a setting of `Event` matches a heading written as `**Event**`.
- **An inline IMAGE normalizes to the EMPTY string, not to its alt text.** A link's label *is* its rendered text (an `<a>` element's `textContent`), but an image renders as an `<img>` element whose `textContent` is `""` — the alt text is an ATTRIBUTE, not rendered text. So `![Event](y.png)` must normalize to `""`, and a heading that is only an image must NOT open the Event block. Substituting the alt text made the parser open a section the reading view never opened (and, in the opposite direction, made the two sides disagree about the same file).
- **Inline code spans are exempt from the markup stripping.** A code span renders its contents literally, so `` `**Event**` `` shows as `**Event**` in the DOM — the markers are part of the visible text and must survive. `normalizeHeadingText` splits the raw text into code and non-code parts and only transforms the non-code parts.
- Emphasis is only stripped when unambiguous (CommonMark's intraword rule): `_` inside a word is literal, so `foo_bar_baz` stays `foo_bar_baz` and does **not** match a configured `foobarbaz`.
- The DOM side must NOT re-strip markup: text taken from a rendered heading goes through `normalizeRenderedHeadingText` (whitespace only), because the markup has already been rendered away.

**Boundary computation**:
1. Scan the file top to bottom and record the line number of the **first** occurrence of the configured heading only.
2. The block spans from that recorded position to the next heading at the **same level or above** (i.e. a heading whose level is `<=` the configured level), or to end-of-file.
   - **Deeper headings are subheadings and stay INSIDE the block.** With the heading configured at H2, a `### Sub` heading and its content remain part of the Event block; only an H1 or H2 ends it. This lets a note group events under nested sub-headings.
3. If the configured heading is not found anywhere in the file, the file has **no Event block** and yields **zero events** — there is no whole-body fallback (see 1.7).

**Fenced code blocks are boundaries** (`FenceTracker` in `parser.ts`):
- A fenced code block (``` or ~~~) is a boundary for BOTH the block boundary computation and the timeline parse. The Markdown renderer treats it the same way, so the parser and the DOM must agree.
- A `#` line **inside** a fence is CODE, not a heading: it can neither open nor close the Event section. Without this, a single fenced `#` line silently truncated the section and every event after the fence disappeared.
- An **event-shaped line inside a fence is NOT an Event** (`- 99:99 - 99:99 [Work] fake` stays literal text).
- The fence's own lines are **not absorbed** into the preceding event's description — a fence is a boundary, not a continuation.
- The fence state is tracked on **every** line, whether or not the Event block has started yet, so a fence that opens *before* the configured heading still shields the heading scan.
- CommonMark fence rules are honoured: the closing fence must use the **same character** as the opener and be **at least as long** (a ``` fence is not closed by a ~~~ line), and a backtick fence's info string may not contain a backtick.
- On the DOM side, `walkDocumentOrder()` **skips every node inside a `<pre>`/`<code>` element** — the renderer emits those for a fenced block, so a `#` inside a fence is never a heading element there, and a `[Category]` token inside a fence stays literal text.

**Inline creation**: `appendLineToBlock` inserts a new Event line at the end of the heading's **own** content — i.e. before the first deeper (sub)heading inside the block — so the Event list stays grouped directly under the configured heading and nested sections keep their own content. When the note has no Event block at all, the configured heading is created at the end of the file and the new line goes right under it (otherwise the event would land outside every block and never be parsed back).

**Category badges are scoped the same way**: `categoryBadges.ts` renders a `[Category]` badge only for tokens inside the configured Event section — in the live editor via the block range from `findEventBlockInContent`, and in the reading view via `isWithinEventHeading` (which takes the rendered `<h1>`–`<h6>` headings preceding the token). A `[Category]` typed outside the Event section stays plain text, matching the parser's strict scoping. `isWithinEventHeading` lives in `parser.ts` (not `categoryBadges.ts`) so it stays unit-testable without the Obsidian API — `parser.test.ts` covers it, including a cross-check that it agrees with the file-based block range.

**The badge rule MUST mirror the parser's block rule exactly** (boundary computation steps 1–2 above):
- The section is opened by the **FIRST** heading matching the configured text *and* level — a later heading with the same text does **not** re-open it.
- It is closed by the next heading at the **same level or above**; deeper headings are subheadings and stay inside.
- Consequence: with two `# Event` headings, only the content between the first and the second is inside the section — the same range `findEventBlock` returns for that file. The reading view and the live editor must never disagree about which lines belong to the Event block. A "last heading wins" rule is wrong here and was the cause of a real parser/renderer mismatch.

**Reading-view heading walk**: the reading view collects the headings that precede a token with a **single document-order traversal** (`walkDocumentOrder`), walking elements and text nodes together (`SHOW_ELEMENT | SHOW_TEXT`) and accumulating headings as they are met. A `TreeWalker` created with `SHOW_ELEMENT` can never yield a text node, so an element-only walker must **not** be compared against a text node to detect "reached the target" — doing so makes the walk run to the end of the document and silently applies the scoping rule to the whole note. The DOM-level behaviour is covered by `src/categoryBadges.reading.test.ts` (see §4).
