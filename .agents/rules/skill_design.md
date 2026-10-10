---
name: skill_design
description: Design system guidelines and tokens for Importaciones Shalom operational web application
trigger: always_on
---

# Design System Rules — Importaciones Shalom (`skill_design.md`)

When creating, designing or updating views, components, tables or forms, strictly apply the design system defined in `skill_design.md`:

## Color Tokens
- `--color-canvas`: `#F2F6F8` (main background)
- `--color-surface`: `#FFFFFF` (panels, tables, forms, cards, dialogs)
- `--color-brand-deep`: `#123D4A` (fixed sidebar, page titles, visual anchors)
- `--color-brand`: `#167D8D` (primary buttons, active navigation, links, focus)
- `--color-brand-soft`: `#E4F1F3` (selected row background, subtle highlights)
- `--color-text-primary`: `#123D4A` (primary text and headings)
- `--color-text-secondary`: `#627985` (descriptions, metadata, table headers)
- `--color-border`: `#D8E3E7` (table borders, dividers, input borders)
- `--color-warning`: `#BC791F` (attention states such as low stock or pending review)
- `--color-danger`: `#B3402A` (destructive actions, critical errors, stockouts)
- `--color-success`: `#2F7D4F` (positive completion states)

## Typography
- Display and headings: `Barlow Semi Condensed` (semibold 600, page title 28-32px, section title 20-24px).
- Body, tables, forms, controls: `Source Sans 3` (regular 400, 14-16px, medium 500 for buttons).
- Sentence case: Never use ALL CAPS for navigation, table headers, badges or labels.
- Headings left-aligned, no italics.
- No monospace for normal data labels.

## Layout
- Fixed left sidebar: 220px, background `--color-brand-deep`, white/light text.
- Header: breadcrumbs, operational context status, controls.
- Main workspace: background `--color-canvas`, panels/tables on `--color-surface`.
- No decorative shadows. Rely on 1px borders (`--color-border`) and surface contrast.
- No gradients as decoration.
- Keep interface light and high-contrast.
