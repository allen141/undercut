# Buying

## Entry and decisions

After arrival, the wholesale book shows all three local vendors together before the player commits to any visit. The vendors have different assortments and give the player different reasons to spend one of the day's two visits.

| Town | Bargain vendor | Generalist | Specialist |
| --- | --- | --- | --- |
| Meadow | Mill Yard | Meadow Supply | Greenbank Growers, Grain and Herbs |
| Forge | Foundry Surplus | Forge Supply | Ember Works, Iron and Crystal |
| Harbor | Dockside Lots | Harbor Supply | Tideway Imports, Cloth and Tea |

The bargain vendor emphasizes low-priced stock and limited lots. The generalist offers a broad assortment. The specialist emphasizes the town's signature goods. These are working vendor names. Assortments, stock quantities, and price advantages are set in the vendor data and tuned in playtests.

## Core UI and feedback

- Compare each vendor's effective unit prices, stock for today, rotating discount lot prices and quantities, and the player's current reputation with that vendor. Show locked offers with their reputation requirement and distinguish them from unavailable or sold-out stock. The comparison stays readable while a visit is active. Reloading preserves today's lots and remaining quantities.
- Select a vendor to begin a visit. Show which vendor is active, which have been visited, and how many visits remain. Starting a visit spends one of the two visits even if the player leaves without buying.
- During a visit, show available gold and allow purchases from that vendor's regular stock and discount lots. Show the unit price, quantity, and total before confirming. An accepted purchase updates gold, stock, the inventory cost lot, and reputation progress together. Unaffordable or excessive quantities display the reason and leave the visit available for a corrected purchase.
- When the player leaves a vendor or moves to a second one, the first visit is over. The player can buy several times during the same visit, finish after one visit, or skip buying entirely. The selected sequence is final as each visit begins, and a vendor cannot be revisited that day.

## Vendor reputation

Reputation belongs to each vendor within each campaign. Gold spent with that vendor accumulates toward reputation thresholds. Show current standing, progress to the next threshold, and any rate improvements or unlocked offers. Apply new benefits to subsequent eligible purchases and show the updated quote before a purchase is confirmed. Each recorded purchase keeps the unit cost paid at the time.

## Display setup and exit

After buying ends, the player assigns in-stock goods to one window display and three floor displays and sets a price on each assigned display. Show on-hand quantity and the town's expected budget range beside each good. Keep one display per good, allow empty slots, and make invalid prices or assignments clear. The window is a visually prominent fourth slot with no demand modifier in this iteration.

**Open Shop** commits the assortment and prices and starts business. A player who skips vendors can display carried inventory. A player with no inventory can still open with empty displays and see what customers ask for. No purchases occur once buying is complete, and the day's displays and prices are fixed once the shop opens.
