# World news and market outlook

## Morning newspaper

Every campaign day starts with **The Wandering Gazette** over the shop scene. The issue has a short world dispatch, a trade or previous-day town report, and a market outlook for all six goods. Once the player chooses **Choose today's town**, the newspaper yields to the Route Atlas. The player can reopen the atlas or the newspaper without changing campaign state.

The opening issue appears on day one. Later issues include a report derived from yesterday's recorded town and sales, so the paper reflects the player's world history without changing simulation rules.

## Data and repeatability

`newspaperForDay(seed, day, history)` returns typed articles and market outlook rows. The issue is derived from the campaign seed, day, deterministic vendor quotes, and recorded daily results. It does not need a separate save record: reopening or refreshing the same day reconstructs the same issue.

Each article has a stable ID, category, source, headline, body, occurrence and expiry days, and an effects list. `WorldEffect` defines extension points for global price, town supply, town demand, and story-flag effects. Current articles are informational and have empty effects; their effects are not yet applied to gameplay. This keeps the future event contract explicit without making early game balance depend on story content.

## Prices and projections

The paper's current global price is the average of regular wholesale quotes across the towns and vendors, before reputation discounts. The change compares the previous day's global average. The projected value is a deterministic, damped continuation of recent movement with small uncertainty. It is a forecast, not a promise or an input to today's vendor quote generation.

Display current value, today's movement, projected value, and projected movement together. Use arrows and signed changes as well as color so the outlook stays readable on phones and for color-blind players. Keep the label **Global average** visible to distinguish the paper's market-wide view from the town-specific wholesale quotes in the Route Atlas.

## Future event growth

Story and economic events should be authored as data with stable IDs, start and expiry days, optional town or good scopes, article copy, and typed effects. The event resolver can later combine authored events with seeded random selection, apply effects to town supply, demand, or market price, and archive resolved events in campaign history. Daily articles should be generated from those events and observed outcomes; the presentation should not own simulation rules.
