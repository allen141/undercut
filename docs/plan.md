# Undercut

Undercut is a browser-based trading game about growing a traveling shop. The longer-term, narrative-led game will let a merchant influence settlements and nations through economic choices, with branching outcomes inside each campaign.

## First milestone

A player signs in by invitation and can start or resume multiple named campaigns. Each begins on day one with 100 gold, empty inventory, one window display, and three floor displays. Campaigns have independent progress and economies.

The existing game follows this shop loop.

1. Choose one of three towns. Compare wholesale availability and prices, local demand, and expected customer budgets for six goods.
2. Buy inventory, select the goods to display, and set the price for each shelf.
3. Open the shop and serve eight customers. Sales depend on demand, price, and availability.
4. Close the shop and review revenue, first-in-first-out cost of goods sold, profit, and wholesale spending. Start another day with the remaining inventory and gold.

The persistent campaign ledger remains available through a Ledger button throughout play. Its inventory, performance, market history, event log, and newspaper archive read from an optional append-only journal stored in the campaign snapshot. Phase-specific books, including the morning newspaper and Route Atlas, open at their stage transitions.

The shop works on desktop and portrait mobile. The active shop fills the viewport with a PixiJS WebGL canvas. The door dial, market, shelves, counter, and ledger carry the day’s actions. Keyboard and assistive technology can reach the canvas controls through semantic controls. Account forms and campaign selection use native browser controls.
A developer-only route at `/__dev/shop` demonstrates an alternate low-poly 3D shop and articulated customer in Three.js/WebGL. It is a visual study and does not change campaign state.

Public registration, multiplayer, offline writes, world simulation, branching story events, and cross-campaign rewards are outside this milestone.

The [shop day design](game-design/README.md) specifies the next iteration of the shop loop, including vendor visits, display setup, automated customer service, and the closing review. It also defines the shared shop room and phase books.

## Completion

A signed-in player can complete a day and reopen the same campaign after refreshing or signing in again. Two accounts cannot see or change each other's campaigns. Retrying a command does not repeat a purchase or sale. Release candidates pass game, API, browser, and deployment checks before being deployed to the shared preview or production environment.
