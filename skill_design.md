## Product visual direction

This product is modular and may contain existing, modified or future modules. Do not assume a fixed list of modules. Preserve every module already present and treat new views as extensions of the same system.

### Product context
- Product type: operational web application for managing business or warehouse processes.
- Primary users: operational staff, administrators and decision makers.
- Primary job: review status, find records, complete tasks and understand what needs attention.
- Visual mood: operational, precise, calm and professional. The interface should feel like a reliable control center, not a marketing site.

### Color tokens
Use these named tokens consistently across every module, dashboard and future view:

- `--color-canvas`: #F2F6F8 — main application background.
- `--color-surface`: #FFFFFF — panels, tables, forms, cards and dialogs.
- `--color-brand-deep`: #123D4A — sidebar, page titles, strong headings and primary visual anchors.
- `--color-brand`: #167D8D — primary buttons, active navigation, selected rows, links and selected chart elements.
- `--color-brand-soft`: #E4F1F3 — selected row background, subtle highlights, focus surfaces and soft chart fills.
- `--color-text-primary`: #123D4A — headings, table text and primary content.
- `--color-text-secondary`: #627985 — descriptions, metadata, table headers and secondary labels.
- `--color-border`: #D8E3E7 — table borders, dividers, input outlines and subtle separators.
- `--color-warning`: #BC791F — attention states such as low stock, pending validation or delayed tasks.
- `--color-danger`: #B3402A — destructive actions, critical errors or blocked states.
- `--color-success`: #2F7D4F — successful confirmations or positive completion states, used sparingly.

Rules:
- Do not use gradients as decoration.
- Do not use a cream background or terracotta accent.
- Do not use pure black backgrounds.
- Use `--color-brand` sparingly: one primary action, one selected state or one active navigation item at a time.
- Use `--color-warning` only for operational attention states.
- Use `--color-danger` only for destructive or critical situations.
- Keep the interface light and high contrast; avoid dark dashboards.
- Do not introduce new brand colors for individual modules.

### Typography
Use two complementary sans-serif families:

- Display and headings: Barlow Semi Condensed.
  - Use for the product wordmark, page titles and important section headings.
  - Prefer medium and semibold weights.
  - Use slightly condensed letterforms to reinforce an operational, precise character.
- Body, tables, forms and controls: Source Sans 3.
  - Use for navigation, table content, labels, descriptions, buttons and forms.
  - Use regular weight for body text and medium/semibold only for emphasis.
  - Keep table text compact but readable.

Type scale:
- Page title: 28–32 px, semibold, Barlow Semi Condensed.
- Section title: 20–24 px, semibold, Barlow Semi Condensed.
- Body: 15–16 px, regular, Source Sans 3.
- Table text: 14–15 px, regular, Source Sans 3.
- Metadata: 13–14 px, regular, Source Sans 3.
- Buttons: 14–15 px, medium, Source Sans 3.

Rules:
- Use sentence case; never use ALL CAPS for navigation or labels.
- Do not italicize words inside headings for emphasis.
- Keep headings left aligned.
- Do not use monospace for normal data labels.

### Layout system
Use a fixed left sidebar and a content-first workspace.

```text
+----------------+------------------------------------------------------+
| Sidebar        | Header: breadcrumb, context selector, notifications  |
| 220 px         |------------------------------------------------------|
|                | Page title + primary action                          |
| Overview       | Key indicators, when applicable                      |
| Existing       |------------------------------------------------------|
| modules        | Filters + search, when applicable                    |
| Future         |------------------------------------------------------|
| modules        | Main working surface              | Context panel    |
|                |                                   | Selected item    |
| User profile   |                                   | Related details  |
+----------------+------------------------------------------------------+
```

Rules:
- Sidebar: 220 px, background `--color-brand-deep`, white or very light text.
- Content background: `--color-canvas`.
- Main panels and tables: `--color-surface`.
- Use a 16–24 px spacing rhythm.
- Prefer one primary action per page.
- Keep the main working surface as the central element.
- Use a right contextual panel only when it helps inspect or act on the selected record.
- Do not split content into uniform rounded cards.
- Use horizontal summary values instead of a row of identical stat cards.
- The sidebar must remain scalable: group navigation by user task, keep it scrollable and show only modules the current user can access.

### Components
- Primary button: solid `--color-brand`, white text, 6–8 px radius.
- Secondary button: white surface, 1 px `--color-border`, dark text.
- Selected table row: `--color-brand-soft`.
- Active navigation item: subtle white overlay or teal left indicator.
- Table header: `--color-text-secondary`, medium weight, no ALL CAPS.
- Table rows: white surface, 1 px bottom border.
- Inputs: white surface, 1 px `--color-border`, 6–8 px radius.
- Location, status or category indicators: simple geometric blocks or subtle badges.
- Warning badge: `--color-warning` text or a subtle amber background.
- No decorative shadows. Use borders and background contrast for hierarchy.

### Dashboard or overview pattern
If the application has an overview or dashboard view, use it to show a cross-module operational summary. It must adapt automatically to the modules that currently exist.

The overview should answer:
- What needs attention today?
- Which areas have pending work?
- Which module should the user open next?

Use this structure:

```text
+----------------+------------------------------------------------------+
| Sidebar        | Header: breadcrumb, context selector, notifications  |
|                |------------------------------------------------------|
| Overview       | Page title + short description                       |
| Existing       |                                                      |
| modules        | [Context selector] [Primary action, if needed]       |
| Future         |------------------------------------------------------|
| modules        | Key indicators                                       |
|                |------------------------------------------------------|
|                | Attention required              | Recent activity    |
|                |------------------------------------------------------|
|                | Module summaries                | Relevant charts    |
+----------------+------------------------------------------------------+
```

#### Key indicators
Show between four and six indicators in a horizontal strip, not as identical decorative cards.

Each indicator must include:
- A clear label in sentence case.
- A numeric value.
- A short context line when useful.
- A direct link to the related view or module.

Rules:
- Show only indicators that support a decision or action.
- Keep the same visual weight for all indicators.
- Use `--color-warning` only when the value requires attention.
- Do not use gradients, oversized icons or animated counters as the main visual device.

#### Attention panel
Create a prioritized list titled “Atención requerida” only when the application has actionable pending items.

Each item must include:
- The related module or area.
- A concise description.
- A direct action, such as “Revisar”, “Confirmar” or “Ver detalles”.

Rules:
- Sort by operational urgency, not by module name.
- If there are no issues, show: “No hay tareas pendientes para hoy.”
- Do not invent urgency or use alarming colors without a real threshold.

#### Module summaries
Show compact summaries for the modules that currently exist and are available to the user.

Each summary must include:
- One or two lines of relevant information.
- A direct link to the module.
- The same visual component for every module.

Rules:
- Generate summaries from the modules actually present in the application.
- Do not assume that a particular module exists.
- If a module is disabled or unavailable, show: “Este módulo aún no está disponible.”
- Do not hide unavailable modules from users who need to configure or enable them.

#### Charts
Use charts only when they answer a real operational question.

Recommended chart types:
- Bar chart: comparison by category, status or location.
- Line chart: activity over time.
- Stacked bar chart: distribution by status.
- Simple list: top items requiring attention.

Rules:
- Prefer tables and lists when precision matters.
- Use no more than two charts on the initial overview.
- Label axes, units and time ranges clearly.
- Use the product palette; do not introduce a new color palette per chart.
- Provide text alternatives or an accompanying table for accessibility.

### Empty and error states
- No data: explain what will appear once data exists and offer the next action.
- No permissions: explain that the user lacks access and how to request it.
- Error: explain that the information could not load and offer a retry action.
- Loading: preserve layout space and avoid layout shift.

### Motion
- Keep motion minimal.
- Use a subtle transition when opening the contextual panel or confirming an action.
- Do not animate every card or section on page load.
- Respect `prefers-reduced-motion`.

### Accessibility
- Maintain at least WCAG AA contrast for text and controls.
- Make selected rows and active navigation clear without relying only on color.
- Ensure visible keyboard focus using `--color-brand`.
- Keep interactive rows at least 44 px tall on touch interfaces.
- Do not communicate status by color alone; pair it with a readable label.

## Extensibility rules
- A new module must be able to contribute an indicator, an attention item, a summary and a chart without changing the dashboard layout.
- Use a configurable dashboard structure: modules register their widgets, priorities and links.
- Keep widget order configurable by role or user when personalization is needed.
- Never hardcode module-specific colors, fonts or layout exceptions.
- Maintain one shared component library for indicators, summaries, tables, filters, panels and charts.
- When a module is added, updated or removed, preserve the existing navigation hierarchy and visual language.
- Do not remove, rename, merge or replace existing modules unless the user explicitly requests it.