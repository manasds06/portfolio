---
name: verify
description: Launch and drive the blob portfolio to verify changes end-to-end.
---

# Verifying the blob portfolio

## Launch

The `node_modules/.bin` shims are not executable on this machine, so call
the tools through node:

```bash
node node_modules/next/dist/bin/next dev        # http://localhost:3000
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js src
```

Don't run `next build` while the dev server is serving.

If a CSS edit seems to have no effect (for example dots render with zero
size), the dev server is serving a stale stylesheet from its cache: stop
it, delete `.next/`, and start it again. Confirm by fetching the page's
`/_next/static/chunks/*.css` and grepping for the new rule.

## Drive it

The simulation is exposed as `window.__sim` (see `src/blob/sim.ts`).

- `__sim.pieces` is the list of spheres: `{x, y, r, vol, tokens}` in CSS px.
  Tokens are 0 projects, 1 experience, 2 about. One piece holding all three
  is the whole blob. `cbrt(sum of vol)` must always equal `__sim.R0`.
- Cutting needs no mouse button: a pointer path that passes through a piece
  faster than 1000 px/s cuts it along that line. Real `hover` actions jump
  and carry no speed, so dispatch `pointermove` events on `.stage` yourself,
  about 15 steps 10 ms apart across the blob. One swipe makes exactly one
  cut (new pieces ignore cuts for 0.3 s). A slow pass (60 ms steps) must
  not cut.
- Left alone, each piece is pulled toward its host (the bigger piece with
  the strongest volume/distance² pull) and all pieces tug on each other;
  a single cut rejoins in about 2 s of sim time. The pull runs on each
  piece's own clock (free for 0.38 s after its cut, full strength by about
  1.4 s), so it keeps working while you slice other pieces; pieces can't
  fuse until 0.35 s old.
- The hidden Browser pane runs rAF at ~4 fps and the sim caps each frame
  at 0.05 s, so merges look slow there. Time physics by stepping directly:
  set `__sim.cursor.active = false`, then loop `__sim.step(1/240)` and read
  `__sim.time`.
- Only dots are links. In the sentence the words are plain text and the
  dot after each is `button.dot`; in cards it is `.inkdot > button`.
  Blob pieces are not links and carry no names. Clicking a dot opens the
  section: the hash becomes
  `#projects|#experience|#about`, the piece holding that token (the whole
  blob if uncut) grows past the screen and a `.cards` layer mounts with one
  `.wcard`. Dots and `.tile` buttons inside push more cards; only the top
  one has `data-top="true"`. Escape pops one card, and from the last card
  returns to one whole blob.
- Closing a card runs a genie (`src/components/genie.ts`): the card is
  copied into thin `.wcard` strips in a fixed `aria-hidden` layer, so
  `.wcard` counts jump while it runs; wait about 0.7 s before asserting.
  In development `window.__genie(el, {duration: 9000})` replays it slowly
  for screenshots (restore `el.style.visibility` afterwards).
- Effects: each cut pushes a `CutEvent` to `__sim.events`, which the page
  turns into dust grains (`src/blob/dust.ts`, drawn on the trail canvas)
  and a flare along the cut in the dot field. The dot field and the blob's
  lean toward the cursor live in the shader (`src/blob/renderer.ts`). Card
  titles and tiles use `Decode` / `PixelReveal` (`src/components/Decode.tsx`):
  mid-animation the visible text is jumbled glyphs while an `.sr-only` copy
  keeps the real words; a tile's reveal canvas hides itself when done.
- The header's Contact button opens the round contact card on its own
  (hash `#contact`); clicking the email address copies it.
- The ring cursor (`.cursor`) snaps to any dot within 46px: its centre sits
  at the dot plus 8% of the pointer's offset.
- Screenshots taken while the Browser pane is hidden can catch frozen
  mid-transition frames, because animation is paused there.
- Clicking the name (top left) calls `gather()` to pull pieces in at once.
- Initials: a burst reaching 10 pieces within 6 s of the first cut splits
  everything to 32 beads that gather along "MDS" and melt into crisp
  rounded strokes (`__sim.formSegs`, `__sim.formMix` 0..1) for 3 s
  (`__sim.formUntil`), then merge back; cuts are ignored while spelling.
- Tilt: set `__sim.tilt = {x, y}` (-1..1) with the cursor inactive and the
  lamp swings to that side.
- Sound: footer button `aria-pressed`; preference in
  `localStorage["blob-sound"]`. Headless Chrome plays nothing audible.
- Chat: `#ask-input` + `.ask-send` POSTs `/api/ask`; with no
  `ANTHROPIC_API_KEY` it answers "Chat isn't set up on this site yet."
  While waiting, `__sim.thinking` is true and the blob ripples.
- Hot reload resets the simulation to one blob.
