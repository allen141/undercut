# Shop room and books

## Persistent room

The active campaign uses the full viewport for a single Pixi scene. Each town view is composed from one complete room illustration, so the back wall, window opening, town panorama, floor, and lighting remain registered. The arched door is on the right wall and opens during business. Three floor displays and the rear window sill display show current stock. The counter, bell, and ledger sit in the foreground, with the customer behind the counter during a visit.

The complete town illustration establishes the scene's perspective and horizon. Interactive door, window, shelf, and counter bounds are mapped from that same authored scene so controls and overlays register to the artwork. Customers enter and leave through the doorway. The window display sits along the rear sill behind the shopkeeper; the counter and props render above the visitor, followed by sale effects, book pages, and controls. Portrait uses compact displays below the wall openings; wider layouts preserve the full scene.

The runtime WebP textures in `apps/web/public/shop-art/` use the supplied Undercut Shop Assets v0.1, UI Kit v0.2 Expanded, and Front Wall and Door Assets v0.1. The carved door, open door frame, and semicircular dial are transparent crops from the front-wall sheet. The full-height bay window uses a matching frame with a built-in sill. The existing wall, floor, and town paintings are separate textures. Shelf contents, patrons, prices, and controls remain live layers.

## Books on the desk

An illustrated ledger rests on the counter and gently moves while the room is idle. Select it to open the current ledger page. The Route Atlas opens automatically on entering destination selection. Choose and preview towns in the ledger’s Markets page, then travel from that page; the shop room has no destination selector. Markets shows each town's specialty and compares local wholesale price trends against a global average for each good alongside local demand, budget, and held stock. The wholesale book holds vendor comparison and purchases followed by shop setup, the business book holds activity and negotiations, and the closing ledger holds results.

Animate the book opening from the desk into reading position and animate page turns within it. Keep the back window visible while a book is open. On phones in portrait, stretch the parchment across the screen below the wall openings and down to the bottom edge, including when the browser fits a desktop-sized viewport to the display. In landscape desktop mode, keep the full shop visible and open the book as a large centered spread across the lower half of the shop. On short landscape viewports, dock the page to the left of the window. Keep the text and controls at a readable size and paginate dense lists inside the book. An unresolved negotiation opens directly to the offer, then returns to the room when the outcome is recorded.

Each town has a journal available from the room. The opening page shows the local specialty, up to five days of regular wholesale prices for one local good, and a market notice for each vendor’s daily deal. The graph shows the lowest listed regular price before any reputation discount. Open a notice to see its current offer and stock. The journal shares the same reading area as the phase books, so later issues can add more pages while the town scene remains visible. At each day boundary, the room first shifts to night with the closing ledger; **Next Day** opens the morning newspaper, which leads into the Route Atlas.

Closing a book returns attention to the room. Reopening it restores the current page or required decision, including an active vendor visit or negotiation. Browsing pages and opening or closing a book leave the phase and committed decisions intact. Use phase controls such as **Open Shop** and **Next Day** to move the day forward.

## Interaction and feedback

Keep the room, book controls, and page contents operable with mouse, touch, and keyboard. Give Pixi controls corresponding semantic controls with clear names, focus order, and status feedback. Focus the active book when it opens and return focus to the desk control when it closes. A reduced-motion presentation keeps the same page changes and focus behavior with simpler transitions. Ensure animations can complete independently of purchases, sales, and other saved game actions.
