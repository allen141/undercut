# Shop day design

The [Merchant Ledger redesign](merchant-ledger.md) records the agreed direction for the next UI iteration. It supersedes conflicting interface and gameplay details in the existing phase specifications once implemented; the descriptions below document the existing loop in the meantime.

The companion [Merchant Ledger implementation roadmap](merchant-ledger-implementation.md) defines the architecture, phased work, review sequence, acceptance criteria and release constraints.

Undercut is a traveling shop game. Each day, choose a market, decide where to spend your gold, set out the goods you think will sell, and see what those choices earned. The shop room stays on screen throughout the day. Each phase has a book on the desk for decisions and results.

## The four phases

| Phase | Player decisions | Ends when |
| --- | --- | --- |
| [Destination](01-destination.md) | Read the morning newspaper, compare towns, and commit to today's destination. | The shop arrives and the wholesale book becomes available. |
| [Buying](02-wholesale.md) | Compare the local vendors, visit up to two, then choose displays and prices. | The player selects **Open Shop**. |
| [Business](03-business.md) | Watch eight customers and respond to any price offers. | The eighth customer is resolved and the shop closes. |
| [Closing](04-closing.md) | Review profit and the decisions behind it in the nighttime shop, then choose when to start another day. | **Next Day** opens the next morning's newspaper. |

The [shop room and books specification](shop-room-and-books.md) applies across all four phases.

The [world news and market outlook specification](world-news.md) describes the deterministic newspaper data model and the extension points for authored world events.

## Campaign baseline

- Each campaign starts on day one with 100g and empty inventory. Gold, unsold inventory, daily history, and vendor reputation stay within the campaign.
- Keep Meadow, Forge, and Harbor. Keep the six goods Grain, Herbs, Cloth, Tea, Iron, and Crystal, along with the towns' established specialties, demand profiles, and expected customer budgets.
- Keep eight customers per day. Allocate one window display and three floor displays. Record inventory at the actual price paid and expense sold units in first-in, first-out order.
- Vendor prices, stock quantities, rotating discount lots, and reputation thresholds and benefits are data-driven. Tune their values in playtests.
- Refreshing resumes the campaign at its saved phase and outstanding decision, including a current vendor visit or a price offer awaiting a response.

This iteration focuses on buying, pricing, selling, and reading the results. Story, national simulation, and elaborate illustration are outside its scope.
