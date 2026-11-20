# Shop room and books

## Persistent room

The active campaign uses the full viewport for a single Pixi shop scene. Keep the room recognizable from selecting a destination through closing. The door is on the left and occupies roughly one fifth of the room's width. The wall fills the remaining width, with a large bay window on the right occupying roughly three fifths of the room's width. The remaining wall space and foreground hold the desk, counter, and three floor displays. Put the window display in the bay window while leaving the town vista readable behind it.

Meadow, Forge, and Harbor each have a recognizable vista through the window. Use simple scenic elements to distinguish them, such as fields, forge rooftops, and harbor water. The view updates on arrival, and the room's lighting and door state reflect whether the shop is preparing, trading, or closed. Keep the layout and essential controls readable in desktop and portrait viewports. On narrow screens, reflow the foreground and fit the room to the viewport so the door, window, and desk remain visible and reachable.

## Books on the desk

Each phase has a physical book the player can open from the desk. The destination book holds town comparison, the wholesale book holds vendor comparison and purchases followed by shop setup, the business book holds activity and negotiations, and the closing ledger holds results. Clearly indicate which book is available in the current phase. Changing phases updates the book in the room.

Animate the book opening from the desk into reading position and animate page turns within it. An open book takes up a region roughly the size of the bay window while the surrounding room stays visible. On portrait screens, size the reading surface for legible text and usable controls, and paginate or scroll dense lists inside the book. An unresolved negotiation opens directly to the offer, then returns to the room when the outcome is recorded.

Closing a book returns attention to the room. Reopening it restores the current page or required decision, including an active vendor visit or negotiation. Browsing pages and opening or closing a book leave the phase and committed decisions intact. Use phase controls such as **Open Shop** and **Next Day** to move the day forward.

## Interaction and feedback

Keep the room, book controls, and page contents operable with mouse, touch, and keyboard. Give Pixi controls corresponding semantic controls with clear names, focus order, and status feedback. Focus the active book when it opens and return focus to the desk control when it closes. A reduced-motion presentation keeps the same page changes and focus behavior with simpler transitions. Ensure animations can complete independently of purchases, sales, and other saved game actions.
