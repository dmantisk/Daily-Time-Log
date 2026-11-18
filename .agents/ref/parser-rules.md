# Project Rules & Instructions for AI Agents

> Detailed, on-demand reference. The concise always-on project guide is [AGENTS.md](./AGENTS.md); this file retains the former numbered rules referenced by older design and review notes.

Welcome, AI Agent! You are working on the **Daily Work Log** Obsidian Plugin. This project aims to build an Obsidian plugin that visualizes daily time tracking directly from daily markdown files.

Please strictly adhere to the following rules and specifications during development.

---

## 1. Core Architectural Constraints & File Parsing

> Split into topic files. Section numbers (§1.x) are unchanged; find the one you need below and read only that file.

| Section | Topic | File |
| --- | --- | --- |
| §1.1, §1.2, §1.2.1, §1.7, §1.8 | Document format, frontmatter, CRLF, no-fallback, dashboard statistics | [parser-format.md](./parser-format.md) |
| §1.3 | Event block marker (single configurable heading) | [parser-marker.md](./parser-marker.md) |
| §1.4, §1.4.1, §1.4.2, §1.5, §1.6 | Event lines, category extension, continuation lines, removed blocks | [parser-event.md](./parser-event.md) |
