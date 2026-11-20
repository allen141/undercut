# Shop room and books

## Persistent room

The active campaign uses the full viewport for a single Pixi scene. The back wall has a separate arched door on the left and a floor-to-ceiling bay window on the right. The window occupies most of the view. One panorama forms the town view through both openings. The door opens clear of the street view during business and closes during destination selection, buying, and closing. Three floor displays and a narrow section of the window sill show the current stock. The counter, bell, and ledger sit in the foreground, with the customer behind the counter during a visit.

The scene builds depth through its draw order. The illustrated timber wall and floor share a horizon with the doorway and shelves. The scenery layer clips the selected town painting to both openings in one coordinate space. The frames, lantern, and display goods sit in front of the painting. Customers enter and leave through the doorway. The counter and props render above the visitor, followed by sale effects, book pages, and controls. Portrait uses compact floor displays below the wall openings. Wide layouts set the displays on either side and set the counter farther forward.

The runtime WebP textures in `apps/web/public/shop-art/` use the supplied Undercut Shop Assets v0.1, UI Kit v0.2 Expanded, and Front Wall and Door Assets v0.1. The carved door, open door frame, and semicircular dial are transparent crops from the front-wall sheet. The full-height bay window uses a matching frame with a built-in sill. The existing wall, floor, and town paintings are separate textures. Shelf contents, patrons, prices, and controls remain live layers.

## Books on the desk

Each phase has a physical book the player can open from the desk. The Route Atlas opens automatically on entering destination selection. The dial enlarges above the door and stays usable while the atlas is open. Activate a town symbol to preview the town in the window and the atlas, then activate the dial’s center to travel. The atlas shows the previewed town's specialty and compares local wholesale price trends against a global average for each good alongside local demand, budget, and held stock. The wholesale book holds vendor comparison and purchases followed by shop setup, the business book holds activity and negotiations, and the closing ledger holds results. Changing phases updates the book’s live nameplate.

Animate the book opening from the desk into reading position and animate page turns within it. Keep both wall openings visible while a book is open. On phones in portrait, stretch the parchment across the screen below the wall openings and down to the bottom edge, including when the browser fits a desktop-sized viewport to the display. On wider screens, dock the page to the left of the window. Keep the text and controls at a readable size and paginate dense lists inside the book. An unresolved negotiation opens directly to the offer, then returns to the room when the outcome is recorded.

Each town has a journal available from the room. The opening page shows the local specialty, up to five days of regular wholesale prices for one local good, and a market notice for each vendor’s daily deal. The graph shows the lowest listed regular price before any reputation discount. Open a notice to see its current offer and stock. The journal shares the same reading area as the phase books, so later issues can add more pages while the town scene remains visible.

Closing a book returns attention to the room. Reopening it restores the current page or required decision, including an active vendor visit or negotiation. Browsing pages and opening or closing a book leave the phase and committed decisions intact. Use phase controls such as **Open Shop** and **Next Day** to move the day forward.

## Interaction and feedback

Keep the room, book controls, and page contents operable with mouse, touch, and keyboard. Give Pixi controls corresponding semantic controls with clear names, focus order, and status feedback. Focus the active book when it opens and return focus to the desk control when it closes. A reduced-motion presentation keeps the same page changes and focus behavior with simpler transitions. Ensure animations can complete independently of purchases, sales, and other saved game actions.
