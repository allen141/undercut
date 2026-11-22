# Harbor Shop 2.5D scene assets

Copied from the user-provided `Undercut_Harbor_Shop_Desktop_25D_Kit.zip`.

- `scene/harbor_shop.scene.json` supplies the authored 1448×1086 placements, z-order, interaction rectangles, right-wall door states, and shopkeeper animation metadata. The entrance uses complete closed/open right-wall sprites so the door, arch, and threshold share one perspective. The merchant station is assembled into one animated sprite at load, with the keeper and counter sharing a fixed composition while the shopkeeper changes poses. The left-wall-with-shelves asset preserves the blank wall's original room pixels and composites a transparent shelf layer over the plaster; the back window remains separate.
- `art/` contains the room art, 45 keyed environment assets, and 36 shopkeeper animation frames used by the WebGL study and the campaign's Pixi room renderer.
- The WebGL study's Shelf stock selector previews Harbor, Meadow, Forge, or empty inventory. It places the matching game-good icons on the two built-in shelf rows and reflects stock quantity with a second displayed unit for larger quantities.
- The campaign renderer uses the same left-wall asset and puts live shelf stock on its two angled rows; its other two displays remain on the center table and counter.
- The room uses camera-locked orthographic texture planes; the kit's perspective is painted into the art. The separate Traveler shopper sheets remain sourced from `demo-assets/traveler/`.
- `LICENSE_AND_PROVENANCE.md` is retained from the supplied kit.

The package's source sheets, standalone preview, and separate browser prototype are omitted; the in-app route uses its own Three.js scene and controls.
