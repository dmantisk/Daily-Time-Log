# Project Rules & Instructions for AI Agents

> Detailed, on-demand reference. The concise always-on project guide is [AGENTS.md](./AGENTS.md); this file retains the former numbered rules referenced by older design and review notes.

Welcome, AI Agent! You are working on the **Daily Work Log** Obsidian Plugin. This project aims to build an Obsidian plugin that visualizes daily time tracking directly from daily markdown files.

Please strictly adhere to the following rules and specifications during development.

---

## 6. UI Design Reference

When implementing or modifying **any UI component** (sidebar view, modals, CSS, components), you MUST read [`.agents/design.md`](./design.md) first.

It defines:
- Design principles (pastel color palette, desaturated buttons, minimal delete button)
- Component layouts (Event grid, Timeline modal, Confirmation popup)
- CSS class naming conventions (`dwl-*`)
- Color system and button specs
- File write safety checklist for new write operations