# FIFA Universe V5.2 — Infantino AI Next Phase Checkpoint

V5.1 checkpoint: hands-free wake word, admin greeting, 30-second conversation session, context-aware commands, best-available browser voice, 3D Spatial AI integration.

## Next build priorities

1. **Neural Voice Gateway**
   - Server-side voice endpoint; no secret API key in browser.
   - Premium human-like Turkish male AI voice.
   - Streaming playback for lower latency.

2. **Infantino Brain / LLM Layer**
   - Natural free-form questions instead of fixed intent patterns.
   - Ground every answer in FIFA Universe source-of-truth data.
   - Page/player/match conversational context.

3. **True Barge-In**
   - User can interrupt Infantino while it is speaking.
   - “Infantino dur” / new question cancels speech immediately.

4. **Proactive Intelligence**
   - Standing changes, records, final qualification and upset alerts.
   - Admin-controlled Proactive Voice ON/OFF and quiet mode.

5. **Voice-Controlled Admin Operations**
   - “Çağlar–Kerim maçını 3-2 kaydet.”
   - Read-back + explicit confirmation before write.
   - Admin permission enforcement and audit trail.

6. **Dedicated On-Device Wake Engine**
   - Replace repeated Web Speech wake listening with a local hotword model where feasible.
   - Better privacy, battery use and reliability.
   - Native Android companion only if lock-screen/background wake is required.

7. **Spatial Museum / Player Galaxy**
   - 3D trophy room, record walls and camera transitions.
   - Voice navigation through museum exhibits.

## Non-negotiable architecture rules

- Existing tournament/result engine remains source of truth.
- AI layers must not scrape arbitrary DOM text for data.
- Voice/LLM secrets stay server-side.
- Any write action requires role check and confirmation.
- Spatial/AI layer must fail safely back to the normal site.
