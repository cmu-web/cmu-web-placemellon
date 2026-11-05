// Link previews: writes each docs page's Open Graph tags into its head,
// after <title>, from the page's title and description. Addresses use the
// prod host, so previews point there.
//   node scripts/opengraph.mjs            write the tags into docs/*.html
//   node scripts/opengraph.mjs --check    fail if any page's tags are out of date
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as prettier from "prettier";

const BASE = "https://placemellon.andrew.cmu.edu/";
const SITE = "PlaceMellon";
const IMAGE = {
  src: "images/preview.jpg",
  width: 1200,
  height: 630,
  alt: "PlaceMellon's home page: From Here, Any Dimension Is Possible, beside a Scotty placeholder.",
};
const START = "<!-- Link previews: written by scripts/opengraph.mjs -->";
const END = "<!-- End of link previews -->";

const docs = new URL("../docs/", import.meta.url);
const text = (html) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
const attr = (s) => s.replace(/&(?![a-z]+;|#\d+;)/g, "&amp;").replace(/"/g, "&quot;");

function tags(file, html) {
  // "Builder - PlaceMellon - Carnegie Mellon University" -> "Builder - PlaceMellon"
  const page = text(html.match(/<title>(.*?)<\/title>/s)[1]).split(" - ")[0];
  const title = page === SITE ? SITE : `${page} - ${SITE}`;
  const own = html.match(/<meta\s+name="description"\s+content="([^"]*)"/s);
  const description = own ? text(own[1]) : text(html.match(/<p class="cmu-lead">(.*?)<\/p>/s)[1]);
  const url = BASE + (file === "index.html" ? "" : file);
  const meta = [
    !own && `<meta name="description" content="${attr(description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${SITE}" />`,
    `<meta property="og:title" content="${attr(title)}" />`,
    `<meta property="og:description" content="${attr(description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${BASE + IMAGE.src}" />`,
    `<meta property="og:image:width" content="${IMAGE.width}" />`,
    `<meta property="og:image:height" content="${IMAGE.height}" />`,
    `<meta property="og:image:alt" content="${attr(IMAGE.alt)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
  ].filter(Boolean);
  return [START, ...meta, END].join("\n");
}

const check = process.argv.includes("--check");
const stale = [];
for (const file of readdirSync(docs).filter((f) => f.endsWith(".html"))) {
  const path = fileURLToPath(new URL(file, docs));
  const html = readFileSync(path, "utf8");
  // Redirect stubs for moved pages get no previews
  if (html.includes('http-equiv="refresh"')) continue;
  // Read the page without the tags this wrote last time
  const bare = html.replace(new RegExp(`\\s*${START}[\\s\\S]*?${END}`), "");
  const next = bare.replace(/(<\/title>)/, "$1\n" + tags(file, bare));
  const out = await prettier.format(next, {
    ...(await prettier.resolveConfig(path)),
    filepath: path,
  });
  if (out === html) continue;
  if (check) stale.push(file);
  else writeFileSync(path, out);
}
if (stale.length) {
  console.error(
    `Link previews are out of date in ${stale.join(", ")}: run node scripts/opengraph.mjs`,
  );
  process.exit(1);
}
console.log(check ? "ok: every docs page has current link previews" : "wrote link previews");
