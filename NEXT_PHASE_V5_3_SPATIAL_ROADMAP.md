# FIFA Universe V5.3 — Spatial Intelligence Roadmap

V5.2 checkpoint: the voice layer is paused. Spatial Universe is the active development track.

## Next priorities

1. **True 3D Trophy Assets**
   - Replace emoji trophy placeholders with custom WebGL/GLTF-style cup models or lightweight procedural CSS/SVG trophies.
   - Individual trophy identity per FIFA edition.

2. **Galaxy Flight Camera**
   - Click a player star → camera flight → player star expands into Passport orbit.
   - Rivalry line click → two-star rivalry chamber.

3. **Interactive Museum Rooms**
   - Championship Room, Podium Room, Record Wall, Career Timeline corridor.
   - Click trophy → edition-specific final/history card.

4. **Spatial Match Theatre**
   - Last 10 matches represented as floating match cards.
   - Recent result explosion / upset / record visual states.

5. **Dynamic Home Hero Integration**
   - Spatial Universe preview embedded in the normal homepage without forcing full-screen mode.

6. **Visual Proactive Intelligence**
   - No speech required.
   - Standing change, record break, qualification and final alerts become holographic visual events.

7. **Text-Based Infantino Brain (optional)**
   - Keep voice disabled.
   - Natural-language text console backed by source-of-truth data and a server-side LLM gateway when desired.

## Architecture rules
- Normal site remains source-of-truth and fallback.
- Result entry is never rendered/rewritten by the spatial layer.
- No arbitrary DOM scraping.
- All spatial scenes must be disposable overlays.
- Mobile must always have a performant 2D/2.5D mode.
