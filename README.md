# Manas Shrestha — portfolio

A black page with one grainy sphere. The cursor is the lamp that lights it.
Swipe fast across the sphere to slice it, as many times as you like. The
larger pieces carry the section names (Projects, Experience, About); click
one and it swells to fill the screen and becomes that page. Leave the pieces
alone and each one is pulled into the nearest bigger piece until the blob is whole.

## Run it

```bash
node node_modules/next/dist/bin/next dev
```

Then open http://localhost:3000.

## Edit the content

All text lives in `src/content/site.ts`. The resume served at `/resume.pdf`
is `public/resume.pdf`.

## Where things are

- `src/blob/sim.ts` — the physics: slicing by volume, drift, fusing
- `src/blob/renderer.ts` — the WebGL shader: blob, lighting, texture, dot field, lean toward the cursor
- `src/blob/dust.ts` — the grains a cut sheds
- `src/components/BlobHome.tsx` — cursor, sentence, pointer handling
- `src/components/Cards.tsx` — the stacked cards each section opens
- `src/components/Decode.tsx` — jumbled text and pixel blocks that resolve on open
- `src/components/genie.ts` — the genie animation when a card closes

## Ask the blob (chat)

The field under the sentence answers questions about you with Claude
(`src/app/api/ask/route.ts`), using only the facts in `src/content/site.ts`.
It needs one environment variable on the server:

- `ANTHROPIC_API_KEY` - in Vercel: Project Settings > Environment Variables.

Without it the field replies "Chat isn't set up on this site yet." Each
visitor gets 8 questions per 10 minutes and the site 400 a day (per server
instance, best effort). Set `NEXT_PUBLIC_SITE_URL` to your domain so share
previews use it.

## Hidden things

- Slice the blob into 10 pieces within 6 seconds and they gather into
  "MDS", drawn as crisp rounded letters, for three seconds before merging back.
- On phones, tilting the phone moves the light.
- Sound is off until the speaker button in the footer turns it on.
