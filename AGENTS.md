# PlaceMellon: Notes for AI Agents

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [DEVELOPMENT.md](DEVELOPMENT.md)
before changing anything. The rules agents most often break here:

- Pages use CMU's template and the Web Kilt, nothing else.
- Before writing markup, find the component: ask the Web Kilt MCP server
  (https://webkilt.andrew.cmu.edu/mcp) or browse the Components page
  (https://webkilt.andrew.cmu.edu/0/components.html).
- Use the template's classes first, then the Kilt's (cmu-). Never add a
  project-specific class or a stylesheet rule here. If the Kilt lacks
  something, say so and stop; it gets added to the Kilt.
- Never copy the template's CSS or values; pages load it from www.cmu.edu.
- Edit TypeScript in `src/`; `dist/` is generated and isn't committed.
- A public image option changes with the Reference and the Builder in the
  same change, except `?photo=`, which is documented only in the Reference,
  with no Builder control or photo browser.
- The color table in `docs/reference.html` comes from `COLORS` in
  `src/render.ts`. Run `npm run docs`; never edit the table by hand.
- After changing a page's title or description, run `npm run opengraph`.
- Tests never contact CMU Selects; they use local servers.
- Made-up people only (e.g., Andrew Carnegie, ac00).
- Follow the Web Kilt's [writing conventions](https://webkilt.andrew.cmu.edu/0/conventions.html).
- Versions use semantic versioning as plain numbers (e.g., `0.1.0`).
