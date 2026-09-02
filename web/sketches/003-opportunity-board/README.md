# Variant: Opportunity Board (light, kanban + filters)

## Design stance
A light, filterable work surface — like a CRM pipeline for pain points. Three
kanban columns (high WTP / on the fence / frustration-only) with a top filter
toolbar, a search bar, and a selected-idea detail pane.

## Key choices
- Layout: sticky topbar → filter chips → 5-stat strip → 3-column kanban → detail pane
- Typography: Inter + JetBrains Mono for all metrics
- Color: light gray canvas, white cards, blue accent; green/amber/red/purple status
- Interaction: filter buttons, hover cards, search input, per-card metric grid

## Feature coverage (the ask)
- Problem summary (detail pane "problem" + per-card subtext) ✓
- Startup angles (idea cards) ✓
- Pain ranking (implicit: cards sorted within WTP columns) ✓
- Sentiment analysis (filter chips + per-card sentiment tag) ✓
- Expected market value (SAM metric on every card) ✓
- WTP vs frustration (the three columns ARE the split) ✓
- Source breakdown (subreddit filter + per-card "reach") ✓

## Trade-offs
- Strong at: interactive triage, filtering, quick WTP/frustration segmentation
- Weak at: top-down narrative (no lede/story), print-friendliness

## Best for
A founder who wants to actively work the data — filter, sort, drill into an
idea, and mark the ones worth validating.
