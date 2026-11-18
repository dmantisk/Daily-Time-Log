---
description: Rules for the pure parsing, date and statistics modules
applyTo: "src/parser.ts,src/parser/**,src/dailyNote.ts,src/dashboardCollector.ts"
---
- These modules are pure. Never import from "obsidian".
- Only the configured Event heading opens the Event section.
- Preserve source line indices and line endings (LF and CRLF).
- Never absorb unrelated note content into a writable Event.
- Keep parser.ts and the category-badge rendering in categoryBadges.ts in agreement.
- Every behavior change needs a test in the matching *.test.ts.
- Detailed rules (read only the file you need): `.agents/ref/parser-format.md` (format, frontmatter, CRLF, dashboard stats), `.agents/ref/parser-marker.md` (Event heading marker), `.agents/ref/parser-event.md` (event lines, category, continuation lines).
