// Keeps the public color reference on the renderer's palette
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as prettier from "prettier";

const require = createRequire(import.meta.url);
const { COLORS } = require("../dist/render.js");
const path = fileURLToPath(new URL("../docs/reference.html", import.meta.url));
const html = readFileSync(path, "utf8");
const rows = Object.entries(COLORS)
  .map(
    ([value, color]) =>
      `<tr><th scope="row">${color.name}</th><td><code>${value}</code></td><td><code>${color.hex}</code></td><td>${color.group}</td></tr>`,
  )
  .join("\n");
const marker = /<!-- colors:start -->[\s\S]*?<!-- colors:end -->/;
if (!marker.test(html)) throw new Error("The reference page needs color table markers.");
const next = await prettier.format(
  html.replace(marker, `<!-- colors:start -->\n${rows}\n<!-- colors:end -->`),
  { ...(await prettier.resolveConfig(path)), filepath: path },
);
if (process.argv.includes("--check")) {
  if (next !== html) {
    console.error("Color reference is out of date: run npm run docs.");
    process.exit(1);
  }
  console.log("ok: color reference matches the renderer's palette");
} else {
  writeFileSync(path, next);
  console.log("wrote color reference");
}
