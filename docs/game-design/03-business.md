# Business

## Entry and decisions

**Open Shop** opens the customer door and starts the day's eight customer visits. Most visits resolve automatically. The customer looks for a particular good and buys at its listed price if it is displayed, in stock, and within their budget. Otherwise the customer leaves and the business book records the reason.

The day has zero to two standout price negotiations, selected at random as part of the day's customer sequence. A negotiation can occur when the requested good is displayed and in stock and there is room for an offer below the listed price. These customers are among the eight visits. The day pauses until the player responds to each offer.

| Response | Result |
| --- | --- |
| **Accept Offer** | Sell the unit at the customer's offered price. |
| **Hold Shelf Price** | Sell at the listed price if the customer is willing and able to pay it. Otherwise the customer leaves. |
| **Decline** | End the visit without a sale. |

The offer is below the listed shelf price. Show the good, listed price, and offered price before asking for a response. The customer can have room above the offer, so holding the shelf price can succeed or lose the sale. A negotiated sale changes the price for that transaction only.

## Core UI and feedback

- Keep the door, displays, and counter visible as shoppers arrive and leave. Show customer progress out of eight, latest outcome, remaining stock, and running receipts.
- Open the business book to the offer when a customer needs a decision. Keep the choices available until the player responds, then resume automatic visits. The book also gives access to the day's activity and distinguishes ordinary purchases, negotiated sales, and missed sales.
- Use clear outcomes for goods that were never displayed, stocked goods that sold out, and customers who walked away from a price. A sale deducts one unit, adds the actual payment to gold and revenue, and records that unit's first-in, first-out cost.

## Exit and edge cases

The shop closes and the closing book becomes available after all eight visits, including any final negotiation. An unstocked shop and a day with zero offers or zero sales still run through all eight visits. A standout customer whose good is unavailable resolves as a missed sale. Reloading preserves the completed visits and any pending offer. A response resolves its visit once, so retrying it cannot sell another unit or skip a customer.
