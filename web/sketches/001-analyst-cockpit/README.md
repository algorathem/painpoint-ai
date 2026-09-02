# Variant: Analyst Cockpit (dark, dense)

## Design stance
A power-user cockpit. Dark Linear-style chrome, maximized information density,
everything visible in one scroll without a left nav. Built for a founder who
wants the ranked truth fast.

## Key choices
- Layout: full-width stat strip → 2-column (ideas table + right rail)
- Typography: Inter (tight tracking) + JetBrains Mono for numbers
- Color: near-black, single indigo-violet accent, green/amber status only
- Interaction: hover rows, sortable-by-implication table, export button

## Feature coverage (the ask)
- Problem summary column ✓
- Startup angles (ranked ideas table) ✓
- Pain ranking (severity × frequency) ✓
- Sentiment analysis (per-signal donut + bars) ✓
- Expected market value (SAM bars) ✓
- WTP vs frustration (donut split) ✓
- Source breakdown ✓

## Trade-offs
- Strong at: at-a-glance ranking, data density, scanning many ideas
- Weak at: narrative depth, mobile (table collapses poorly), storytelling

## Best for
Solo founder/analyst doing daily triage — "what should I build/validate next?"
