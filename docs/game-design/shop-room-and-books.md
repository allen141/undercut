# Shop room and books

## Persistent room

The active campaign uses the full viewport for a single Pixi scene. The magical archway holds the shop's one changing town view, with a destination dial beside it. Three floor displays and the window display show the current stock. The counter, bell, and ledger sit in the foreground, with the customer behind the counter during a visit.

The scene builds depth through its draw order. The illustrated timber wall and floor share a horizon with the arch and shelves. The scenery layer clips Meadow, Forge, and Harbor to the portal opening and draws the portal frame, warm lantern glow, and shelves in front. The visitor and their arrival and departure movement sit above the shelves. The counter and props render above the visitor, followed by sale effects, book pages, and controls. Portrait uses compact floor displays below the portal. Wide layouts set the displays on either side and set the counter farther forward.

The runtime WebP textures in `apps/web/public/shop-art/` are selected from the user-provided Undercut Shop Assets v0.1 and UI Kit v0.2 Expanded. The room background was cropped into separate wall and floor textures to remove fixed side windows and align the floor. Foliage, inner trim, and light ornaments are part of the supplied artwork. The town, shelf contents, patron, deal and price labels, and control states remain separate live layers. The runtime uses empty shelves and blank skinned surfaces. Concept atlases, demonstration text and numbers, and crops with leftover adjacent artwork stay outside the game.

## Books on the desk

Each phase has a physical book the player can open from the desk. The destination book holds town comparison, the wholesale book holds vendor comparison and purchases followed by shop setup, the business book holds activity and negotiations, and the closing ledger holds results. Clearly indicate which book is available in the current phase. Changing phases updates the book’s live nameplate.

Animate the book opening from the desk into reading position and animate page turns within it. Reserve the whole portal for the town scene during both reading and transitions. On phones in portrait, stretch the parchment across the screen below the window and down to the bottom edge, including when the browser fits a desktop-sized viewport to the display. On wider screens, dock the page to the left of the window. Keep the text and controls at a readable size and paginate dense lists inside the book. An unresolved negotiation opens directly to the offer, then returns to the room when the outcome is recorded.

Each town has a journal available from the room. The opening page shows the local specialty, up to five days of regular wholesale prices for one local good, and a market notice for each vendor’s daily deal. The graph shows the lowest listed regular price before any reputation discount. Open a notice to see its current offer and stock. The journal shares the same reading area as the phase books, so later issues can add more pages while the town scene remains visible.

Closing a book returns attention to the room. Reopening it restores the current page or required decision, including an active vendor visit or negotiation. Browsing pages and opening or closing a book leave the phase and committed decisions intact. Use phase controls such as **Open Shop** and **Next Day** to move the day forward.

## Interaction and feedback

Keep the room, book controls, and page contents operable with mouse, touch, and keyboard. Give Pixi controls corresponding semantic controls with clear names, focus order, and status feedback. Focus the active book when it opens and return focus to the desk control when it closes. A reduced-motion presentation keeps the same page changes and focus behavior with simpler transitions. Ensure animations can complete independently of purchases, sales, and other saved game actions.
