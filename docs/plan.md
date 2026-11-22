# Undercut

Undercut is a browser-based trading game about growing a traveling shop. The longer-term, narrative-led game will let a merchant influence settlements and nations through economic choices, with branching outcomes inside each campaign.

## First milestone

A player signs in by invitation and can start or resume multiple named campaigns. Each begins on day one with 100 gold, empty inventory, one window display, and three floor displays. Campaigns have independent progress and economies.

The existing game follows this shop loop.

1. Choose one of three towns. Compare wholesale availability and prices, local demand, and expected customer budgets for six goods.
2. Buy inventory, select the goods to display, and set the price for each shelf.
3. Open the shop and serve eight customers. Sales depend on demand, price, and availability.
4. Close the shop and review revenue, first-in-first-out cost of goods sold, profit, and wholesale spending. Start another day with the remaining inventory and gold.

The persistent campaign ledger remains available through a Ledger button throughout management play. Its inventory, performance, market history, event log, and saved Gazette editions read from optional additive records in the campaign snapshot. The ledger opens on the workspace for the current stage; the morning edition is integrated with Markets.

The shop works on desktop and portrait mobile. The active shop fills the viewport with a PixiJS WebGL canvas. The Merchant Compass in Markets handles destination choice; the shelves, counter, customer activity, and live business HUD carry shop actions. Keyboard and assistive technology can reach canvas controls through semantic controls. Account forms and campaign selection use native browser controls.
The campaign shop uses the supplied harbor room art, with campaign stock displayed on its shelves and the Traveler sprite animating customer visits. Meadow and Forge visits show the matching Meadows and Foundry views through the window; Harbor retains its harbor view. The standalone scene study at `/__dev/shop` locally and `/preview/shop` on the hosted preview includes a window-view selector and does not change campaign state.

Public registration, multiplayer, offline writes, world simulation, branching story events, and cross-campaign rewards are outside this milestone.

The [shop day design](game-design/README.md) specifies the next iteration of the shop loop, including vendor visits, display setup, automated customer service, and the closing review. It also defines the shared shop room and phase books.

## Completion

A signed-in player can complete a day and reopen the same campaign after refreshing or signing in again. Two accounts cannot see or change each other's campaigns. Retrying a command does not repeat a purchase or sale. Release candidates build, start, render the shop on supported desktop/mobile browser platforms, and pass deployment health verification before being deployed to the shared preview or production environment.
