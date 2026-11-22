# Merchant Ledger redesign — agreed design specification

Status: approved design direction, partially implemented. This specification governs the next UI iteration; where it differs from the existing phase and shop-room specifications, this is the intended replacement behavior. Existing rules remain in effect until the relevant changes are implemented.

See the [implementation roadmap](merchant-ledger-implementation.md) for the technical work breakdown, dependencies, acceptance criteria and rollout plan.

## Product direction

Undercut has two interconnected games:

1. Economic strategy: buy stock where it is inexpensive, exploit the magical shop's ability to open in a different town each day, and sell where margins and demand are favorable. The player is an individual merchant with one shop, not a manager of a chain.
2. Commerce-driven story: eventually the merchant's purchasing, selling, pricing and withholding decisions influence local and global economies, people's lives, quests and events. Profit and social consequences may conflict. Commerce is the means of participating in the story.

The second game and the dynamic economic engine are future work. The current iteration focuses on the first, with interfaces and data models that can accommodate changing markets rather than assuming fixed prices or trends. A normal day should take approximately five minutes, without imposing a timer on analysis.

The ledger is the primary game interface. The illustrated shop is the atmospheric presentation of business and a place for light interaction, not a prerequisite for accessing management controls. The ledger may occupy the entire viewport when shop activity is not relevant. Desktop and mobile have equal priority and equivalent functionality.

## Shared interface

### Approved visual references

The following concept boards are approved visual direction for the redesign. Each pairs desktop and mobile layouts. Use the existing shop artwork, scene perspective, and physical layout during business; do not recreate the room from the concept illustrations. The written specification governs gameplay and data wherever illustrative labels, quantities, prices, controls or chart calculations differ.

- [Markets and supplier workspace](https://chatgpt.com/library?file_id=libfile_d0bec9b809d881918caa69a3a0350e62&account_id=personal)
- [Merchandising and business hours](https://chatgpt.com/library?file_id=libfile_4e511bdaa084819198eff20b53539028&account_id=personal)
- [Closing and historical performance](https://chatgpt.com/library?file_id=libfile_329359af532c8191ad8f6bff084a7656&account_id=personal)

Use one persistent Merchant Ledger instead of separate physical books, town journals, atlas, newspaper and standalone management modal. Keep thematic page names and illustrated assets where helpful. The design is a slightly gritty fantasy management interface matching the shop: weathered leather and stained wood framing, aged brass, muted jewel tones, restrained ornament, desaturated parchment analytical surfaces, illustrated commodity and town icons, decorative serif headings, legible data typography and aligned tabular numbers. Avoid ornate frames around every control and simulated page boundaries that constrain information density.

| Section | Purpose |
| --- | --- |
| Overview | Current stage, finances and next required action |
| Markets | Commodity and town exploration, destination selection, historical reports and estimates |
| Suppliers | Local vendor comparison, visits, purchasing and reputation |
| Inventory | Held goods, actual acquisition cost, stock value and purchase history |
| Merchandising | Display assignments, daily price presets, budget ranges and margins |
| Performance | Current and historical trading results and drill-downs |
| Gazette | Morning headlines, full articles, town notices and archive |

Use a consistent HUD for day, location, phase, gold, inventory value and relevant daily metrics. Provide a prominent current-stage action even when the player browses another section. Outside business, navigation and historical analysis are unrestricted; browsing must not lose drafts, active visits or the current workflow. Commands remain restricted to valid phases. During business, keep attention on the shop and expose only live performance and necessary customer decisions, not the historical analysis workspace.

Use responsive multi-column analytical workspaces on desktop and reorganized, vertically stacked panels on mobile. Support compact/collapsed, docked and expanded presentations where useful; full-screen management is a normal mode, not an exceptional modal. Preserve normal keyboard, touch, focus and reduced-motion behavior. No tutorial in this iteration.

## Daily workflow

| Stage | Default presentation | Transition |
| --- | --- | --- |
| Morning and destination | Expanded Markets view with integrated Gazette headlines and compass | Confirm destination |
| Purchasing | Expanded supplier workspace automatically shown on arrival | Finish or skip buying |
| Preparation | Unified merchandising editor automatically shown after buying | Open Shop |
| Business | Animated shop, compact live HUD, contextual decisions | After final customer presentation, automatically show results |
| Closing | Expanded performance review with analytical drill-downs | Next Day returns to morning Markets view |

Automatically present the appropriate workspace after an authoritative stage transition or reload; restore any outstanding negotiation or vendor visit. Remove manual book opening, back-and-forth menus and unnecessary confirmations. Keep explicit commitment for travel, purchases, opening the shop, and advancing the day. Retain eight normally animated customer visits and current negotiation mechanics.

## Markets, information and destination selection

- Move the destination dial off the shop door and integrate its artwork as a Merchant Compass in Markets. Select a town by compass, town emblem or comparison table; synchronize selections and preview the town vista when the shop is visible. Use an explicit destination confirmation such as **Travel to Forge**.
- Default to a commodity-by-location comparison matrix, with both commodity-first and location-first exploration. Selecting a cell updates relevant chart and detail views. Show numerical estimates, trends, and held stock where relevant; emphasize useful patterns without choosing an optimal route or explicitly telling players which town to select.
- Before travel, provide estimated local retail prices and appropriate aggregate market outlooks, not specific sellers' current offers, stock or exact deal prices. Historical market intelligence can cover unvisited towns through reports whose detail and accuracy vary. Future newspaper articles may hint at deals without directly revealing them.
- Distinguish accurate observed shop performance and actual transactions from reported market history, estimates and forecasts. Forecasts must be imperfect and clearly labeled; never imply guaranteed customer budgets or demand. Unknown or unavailable data must be shown as such.
- Support interactive commodity charts with town series, appropriate aggregate benchmarks, actual historical purchases and projections when available. Provide time ranges, series toggles, exact-value hover/tap inspection and useful zoom/drill-downs. Distinguish regular prices, discounted effective prices and actual prices paid. Do not fabricate unavailable historical observations or reconstruct them from changed game rules.
- Integrate the morning newspaper into destination selection, with relevant headlines alongside market information and full articles/archive in Gazette. Reading an article is not a mandatory intermediate step.

## Suppliers and purchasing

Keep the existing limit of two distinct vendor visits per day, including the cost of starting a visit even if no purchase occurs. After arrival, allow inspection of all local vendors' inventory, effective prices, quantities, offers, and reputation before committing a visit. Show a consolidated comparison with expandable details, meaningful differences between vendors, visited/active status and remaining visits.

Make each offer row the purchase target: tapping an available row buys one unit, without a separate Buy button. Show unit cost and remaining stock, and clearly badge daily and reputation deals as sale offers. Keep vendor visit controls separate because starting a visit commits one of the day's limited visits. Disable rows when the vendor is inactive, the offer is locked or sold out, or the player cannot afford one unit. Keep the player in the same workspace after purchase and preserve actual paid cost accounting. Finishing or skipping purchases automatically advances to preparation.

## Merchandising and daily pricing

- Configure all four displays together (one window and three floor displays). Carry forward yesterday's assignments if stock remains available; allow reassignment and empty displays. Keep one display per good.
- Show product, available stock, next-unit FIFO cost, estimated local retail, expected buyer budget range, selected price and indicative next-unit margin. Make selecting a product and choosing its price inline; remove the separate numeric keypad and per-shelf editing dialogs.
- Offer exactly three price presets: 80% (discount), 100% (market), and 120% (premium). No arbitrary percentages or manual absolute price entry. The 100% baseline is the midpoint of the estimated local retail/customer budget range for that day and town. Convert to valid integer gold consistently using authoritative pricing rules; show the resulting gold amount before opening. The precise rounding convention is an implementation detail to settle in game core.
- Reset pricing to 100% each day, independently of retained product assignments. Allow changing presets during preparation; retain the existing constraint that listings are fixed once business starts.
- Visualize the estimated buyer budget range with a bar and selected price marker, including out-of-range prices. Do not present an invented probability distribution or reveal individual upcoming customer budgets.
- Keep the physical shop's shelves synchronized with assignments; optional scene highlights or drag interactions are complementary, not required for management.

## Business and display replenishment

Keep the illustrated Pixi shop front and center during business, including normally timed customer arrival, sale and departure animations. Retain existing customer negotiation choices and pauses. No new negotiation automation or customer-service minigames in this iteration.

Each display has a fixed capacity independent of the player's total stock; the exact capacity is a tuning decision. Track its available displayed units separately from reserve inventory. Opening the shop fills assigned displays up to capacity from available stock. Sales consume displayed units and preserve FIFO cost accounting. Moving inventory to a display is not a sale or new purchase and must not duplicate stock or change its acquisition value.

Clicking/tapping a display replenishes it to full (or as far as reserve stock permits) in one action, without a quantity dialog. Provide equivalent keyboard access and visible low/empty stock cues. If a customer requests a depleted assigned good and reserves exist, show a brief opportunity to replenish before resolving the visit; otherwise use existing missed-sale behavior. The wait duration is a tuning decision, and a visit must resolve only once. No automatic replenishment; upgrades to capacity are deferred.

The compact live interface shows customer progress, current revenue and profit, available gold, latest customer request/outcome, displayed and reserve stock, and a concise transaction feed. Make restocking and negotiation decisions clear. When an offer is pending, automatically present the contextual offer controls, then resume animated business after resolution. Update visible sales metrics and stock with the revealed result, not before the animation exposes it.

## Closing and historical analysis

Lead with a concise daily dashboard and optional drill-downs. Surface gross profit, revenue, cost of goods sold, gross margin, starting/ending gold, purchases, sales conversion, and remaining inventory at cost. Distinguish cash flow from profit; spending on unsold goods is not cost of goods sold.

Provide interconnected interactive charts and tables for revenue/profit over time, gold and stock value, daily cash-flow breakdown, sales and margins by commodity, performance by town, conversion, missed-sale reasons, pricing outcomes, vendor spending and reputation. Distinguish zero, missing and not-yet-recorded values. Show transaction and customer outcome details without exposing future results. Older records lacking details must remain usable at the level of their available data.

Selecting a town, good, date or missed-sale reason should filter related analysis or link to the relevant market, inventory or pricing view. Closing is also preparation for tomorrow: let the player explore unsold stock's estimated value in other towns and learn why sales were missed. Present opportunities and evidence, leaving decisions to the player. Next Day remains explicit.

## Implementation direction

Separate the existing canvas controller's responsibilities into a shop scene, a workflow controller, a shared ledger shell, phase workspaces, chart components and data selectors. Use PixiJS/WebGL for the shop, customer animation, scene highlights, item and gold effects, and integrated compass artwork/animation. Use responsive React controls for management workflows and data tables, with shared chart components rendered using SVG, Canvas or GPU acceleration as appropriate. Keep one shared design language; do not require every text field or control to be drawn manually in WebGL.

The server remains authoritative. All game rules, including price presets, displayed inventory and replenishment, belong in `packages/game-core`; commands must preserve campaign ownership, atomicity, revision checks and idempotency. Preserve forward-compatible saves and previous-release migration compatibility. Keep UI navigation separate from committed game decisions. Extend historical records additively where needed (e.g. offer types, observed market summaries, actual FIFO sale cost, display and restock events); never rewrite prior observations. No new world simulation, story systems, storage limits or unrelated gameplay in this iteration.

Suggested implementation sequence:

1. Shared ledger shell, responsive layouts, visual system and phase navigation.
2. Markets, integrated compass and newspaper, interactive commodity/location comparisons.
3. Unified supplier comparison and streamlined purchases.
4. Merchandising editor, daily price presets and budget-range visualization.
5. Authoritative display stock, one-click refill, brief customer wait and live business HUD.
6. Closing and historical performance dashboards, drill-downs and necessary additive journal fields.
7. Polish scene transitions, responsive layouts, keyboard/touch usability and animation feedback.

Keep release verification to the existing supported-platform startup/render smoke checks unless additional tests are explicitly requested.

## Deferred design backlog

- Dynamic world and local economic simulation responsive to merchant commerce, with evolving trade opportunities and consequences.
- Commerce-driven quests, stories and events, including choices between profit and helping communities.
- Inventory storage capacity and logistics (economic constraints in priority order: gold, storage space, customer demand), plus display capacity upgrades.
- Customer dialogue, personalities, encounters and optional service minigames that incentivize sales.
- Negotiation policies and automation; preserve manual negotiations until then.
- Richer newspaper intelligence and varying quality of market reports and forecasts.
- Tutorial and contextual onboarding.
