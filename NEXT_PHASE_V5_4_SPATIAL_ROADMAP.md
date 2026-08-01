# FIFA Universe V5.4 — Spatial Stadium & Living History Roadmap

V5.3 checkpoint: Museum, Galaxy, Dynasty, Records and Match Theatre are interactive spatial scenes.
Voice remains paused.

## Recommended next priorities

1. **Spatial Stadium / Match Replay Arena**
   - Selected historical match opens inside a stylised 3D stadium bowl.
   - Timeline, score swings, momentum and important match events become spatial layers.

2. **Living Trophy Lighting**
   - Each FIFA edition gets a distinct trophy lighting identity.
   - Champion museum room inherits edition lighting and era signature.

3. **Galaxy Navigation Map**
   - Persistent camera breadcrumbs between Player Galaxy → Museum → Rivalry → Dynasty.
   - Rivalry heat controls link thickness, pulse speed and particle traffic.

4. **Visual Event History Centre**
   - Proactive holographic events are archived instead of disappearing permanently.
   - “What changed?” panel for new records, Standing movement and qualification changes.

5. **Cinematic Director 2.0**
   - Camera tours react to live source-of-truth data.
   - Tour begins with the most important current story instead of a fixed scene order.

6. **TV / Projector Spatial Ambient Mode**
   - Continuous passive presentation for tournament nights.
   - Spatial Galaxy, last results, standings, records and upcoming matches rotate automatically.

7. **Optional WebGL / WebGPU Enhancement Layer**
   - Keep CSS/SVG as the default reliable renderer.
   - Add WebGL only for capable desktop devices for particle fields and richer trophy materials.

## Architecture rules remain unchanged
- Match result entry is never intercepted or rebuilt by Spatial UI.
- No arbitrary DOM text scraping.
- Source-of-truth data comes only from application analytics/state APIs.
- Spatial layer must always be removable without affecting the normal site.
- Mobile fallback remains mandatory.
