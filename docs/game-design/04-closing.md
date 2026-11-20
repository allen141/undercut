# Closing

## Entry and decision

The door closes after the eighth customer, the result is recorded in campaign history, and the closing ledger becomes available. Show the player what the day earned and how destination, buying, displays, pricing, and offers contributed to the result. The player chooses when to continue with **Next Day**.

## Core UI and feedback

- Lead with gross profit for the day, calculated as sales revenue minus the first-in, first-out cost of units sold. Show both parts of the calculation. Make zero and negative profit legible.
- Show starting and ending gold, wholesale spending, units sold, and remaining inventory. Show the gold movement from buying and sales separately from the profit calculation so a player can see the cash spent on goods still in inventory.
- Summarize purchases by vendor, including any reputation thresholds reached. Group sales and missed opportunities by good and reason, including goods absent from displays, stockouts, and declined prices. Include standout offer decisions and their actual outcomes.
- Use the town and day as context. A player should be able to connect outcomes to the decisions they made using the day's observed results.

## Exit and edge cases

**Next Day** returns the player to destination selection. Ending gold, unsold inventory at its purchase cost, and vendor reputation carry forward. The new day's visits and customer progress start fresh. On a day without purchases, sales, or offers, the relevant totals stay at zero and the ledger explains what happened. Reloading during closing shows the same ledger and allows the player to continue once.
