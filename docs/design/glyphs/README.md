# Persona glyphs

Direction: "constellation plate marks". Engraved, single-weight line drawings (2px, round caps) that mix a bold sign with star nodes and hairline connectors, matching the Big Dipper logo and the site's constellation art. No brand shapes: no starburst, no bolt, no fruit.

- **soft.svg** (Soft Melancholic): a thin crescent with a small sparkle and a lone star in its hollow. Wistful and quiet, with the childish filled moon gone.
- **neon.svg** (Neon Contradiction): a long-armed four-point compass star with a hollow core, plus orbiting dots and a plus mark. Cold and precise, with a small soft centre (the Bake Off half).
- **mumbai.svg** (Mumbai Storyteller): a pointed arch (Mughal doorway, Grand Budapest facade) holding a three-star triangle, a story told in constellation form. Reads nothing like a sunburst.

All three use `viewBox="0 0 64 64"`, `stroke="currentColor"`, no fill, no text. Open `preview.html` to see them at 146px and 48px on the real gradients.

## Where to swap

The glyph is a text character rendered as `{look.glyph}` in `components/landing/PersonaDeck.tsx:116`, inside the gradient circle (lines 112-117; circle is h-20 / sm:h-28 there). The characters come from `LOOKS` in `components/landing/personaStyle.ts:11-13` (fallback `✧` at line 26).

To swap: change `glyph: string` (line 4) to a React node or key, inline the SVG paths in a small component, and render it at line 116 with `className="h-[60%] w-[60%] text-black"`. `lib/personas.ts` emoji fields (lines 17, 30, 43) are separate and feed the battle picker.
