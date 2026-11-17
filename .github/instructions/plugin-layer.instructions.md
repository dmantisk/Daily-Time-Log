---
description: Rules for plugin, view, modal and component code
applyTo: "src/main.ts,src/DashboardView.ts,src/SettingTab.ts,src/modals/**,src/components/**,styles.css"
---
- Read notes through the Vault API. Write only through plugin.processWrite(file, fn).
- Sidebar and dashboard are plain DOM or Obsidian components. No React.
- Prefer Obsidian's native UI components over custom elements.
- Read .agents/design.md before changing views, modals or CSS.
- New user-visible strings need English and Korean entries in src/i18n.ts.