import fs from "fs";
import path from "path";
import sharp from "sharp";
import { Photo, Preview, TIMEOUT_MS } from "./widen";

export const MAX = 2048; // largest Widen preview

const ASSETS = path.join(__dirname, "..", "assets");
const svgInner = (file: string) =>
  fs.readFileSync(path.join(ASSETS, file), "utf8").replace(/^<svg[^>]*>|<\/svg>\s*$/g, "");
// UCM's red-scarf Scotty portrait (the same file as QRnegie's)
const head = svgInner("scotty-head.svg"); // viewBox 0 0 330.17 443.51
const HEAD = { w: 330.17, h: 443.51 };
// A slight gradient behind him, white at the top to light gray at the bottom
const GRADIENT = `<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#e4e5e6"/></linearGradient>`;
// UCM's downward-dog Scotty, in a play bow
const play = svgInner("scotty-play.svg"); // viewBox 0 0 672 485.92
const PLAY = { w: 672, h: 485.92 };
// UCM's Scotty standing on his back legs, looking up
const up = svgInner("scotty-up.svg"); // viewBox 0 0 526.77 768.93
const UP = { w: 526.77332, h: 768.93335 };
const wordmark = svgInner("cmu-wordmark-stacked.svg"); // viewBox 0 0 95.97 61.16
const WORDMARK = { w: 95.973335, h: 61.16 };

export class StaleLinkError extends Error {}

// Previews fit a size x size box; use the smallest that still covers w x h
export function pickPreview(photo: Photo, w: number, h: number): Preview {
  const pw = (n: number) => n * Math.min(1, photo.aspect);
  const ph = (n: number) => n * Math.min(1, 1 / photo.aspect);
  return (
    photo.previews.find((p) => pw(p.size) >= w && ph(p.size) >= h) ??
    photo.previews[photo.previews.length - 1]
  );
}

export async function renderPhoto(
  photo: Photo,
  w: number,
  h: number,
  gray: boolean,
  get: typeof fetch = fetch,
  webp = false,
): Promise<Buffer> {
  const res = await get(pickPreview(photo, w, h).url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.status === 403 || res.status === 404) throw new StaleLinkError(`preview ${res.status}`);
  if (!res.ok) throw new Error(`preview ${res.status}`);
  let img = sharp(Buffer.from(await res.arrayBuffer())).resize(w, h, {
    fit: "cover",
    position: sharp.strategy.attention,
  });
  if (gray) img = img.grayscale();
  // WebP at 75 with full effort: about a quarter smaller than the JPEG, and
  // looks the same
  return webp
    ? img.webp({ quality: 75, effort: 6, smartSubsample: true }).toBuffer()
    : img.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
}

// The Scotty graphic: Scotty centered on a transparent background, to blend
// into any page, or on the slight gradient, edge to edge, to read as a full
// image
export function scottySvg(w: number, h: number, gradient = false): string {
  const s = Math.min((0.8 * w) / HEAD.w, (0.8 * h) / HEAD.h);
  const x = (w - HEAD.w * s) / 2;
  const y = (h - HEAD.h * s) / 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<defs>${GRADIENT}</defs>` +
    (gradient ? `<rect width="${w}" height="${h}" fill="url(#bg)"/>` : "") +
    `<g transform="translate(${+x.toFixed(2)} ${+y.toFixed(2)}) scale(${+s.toFixed(5)})">${head}</g></svg>`
  );
}

// A question mark in the Web Kilt's gray, with Scotty, on white: Scotty
// recumbent (the default), in a play bow to its left, challenging its dot (a
// red ball) to play; or Scotty rampant, standing on his back legs as the dot,
// looking up at a question mark in his own black.
// Each is drawn in its own box, centered and scaled to 80% of the height or
// 90% of the width.
const QUESTION_INK = "#4a535b";
// The dot is his ball, in the red of his scarf
const BALL = "#c4122e";
// Scotty's own black, from the art, for the rampant question mark: he's its dot
const SCOTTY_BLACK = "#231f20";
const hook = (ink: string) =>
  `<path d="M58 66A42 42 0 1 1 128 100C110 112 100 120 100 140V150" fill="none" ` +
  `stroke="${ink}" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/>`;
export function questionSvg(w: number, h: number, rampant = false): string {
  const f = (n: number) => +n.toFixed(3);
  const tall = rampant;
  let box, art;
  if (tall) {
    // Scotty, 82 units tall, his nose a little left of the stem, a gap below it
    const ds = 82 / UP.h;
    const dw = UP.w * ds;
    const dx = 100 - dw * 0.55;
    const dy = 250 - 82;
    box = { x: 44, y: 20, w: 112, h: 232 };
    art = `<g transform="translate(${f(dx)} ${f(dy)}) scale(${f(ds)})">${up}</g>`;
  } else {
    // Scotty, 104 units wide, his nose 10 units from the dot, his paws level
    // with its bottom
    const dw = 104;
    const ds = dw / PLAY.w;
    const dx = 100 - 14 - 10 - 0.98 * dw;
    const dy = 196 - PLAY.h * ds;
    box = { x: -30, y: 22, w: 176, h: 178 };
    art =
      `<circle cx="100" cy="182" r="14" fill="${BALL}"/>` +
      `<g transform="translate(${f(dx)} ${f(dy)}) scale(${f(ds)})">${play}</g>`;
  }
  const s = Math.min((0.8 * h) / box.h, (0.9 * w) / box.w);
  const ox = (w - box.w * s) / 2 - box.x * s;
  const oy = (h - box.h * s) / 2 - box.y * s;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<rect width="${w}" height="${h}" fill="#fff"/>` +
    `<g transform="translate(${f(ox)} ${f(oy)}) scale(${f(s)})">${hook(tall ? SCOTTY_BLACK : QUESTION_INK)}${art}</g></svg>`
  );
}

// A round profile picture: a white ring around Scotty on the slight
// gradient, large enough that the circle crops the tip of his scarf
export function profileSvg(size: number): string {
  const r = 160,
    // A white ring, 2.5% of the size but never under 2 pixels, so it shows
    // on colored backgrounds at small sizes too
    ring = Math.max(8, (2 * 320) / size),
    s = 280 / HEAD.h,
    x = r - (HEAD.w * s) / 2 + 6,
    y = 34;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 320 320">` +
    `<defs>${GRADIENT}<clipPath id="inside"><circle cx="${r}" cy="${r}" r="${r - ring}"/></clipPath></defs>` +
    `<circle cx="${r}" cy="${r}" r="${r}" fill="#fff"/>` +
    `<g clip-path="url(#inside)"><rect width="320" height="320" fill="url(#bg)"/>` +
    `<g transform="translate(${+x.toFixed(2)} ${y}) scale(${+s.toFixed(5)})">${head}</g></g></svg>`
  );
}

// CMU's brand colors (brand.cmu.edu/visual-identity/colors), by name: the core
// colors, then the secondary Tartan and Campus palettes. The size label is
// white or black, whichever reads better on the color (Highlands Sky Blue is
// a near tie, so it takes white, as the brand usually pairs it).
export const COLORS: Record<
  string,
  { name: string; hex: string; label: "#fff" | "#000"; group: "Core" | "Tartan" | "Campus" }
> = {
  "carnegie-red": { name: "Carnegie Red", hex: "#c41230", label: "#fff", group: "Core" },
  black: { name: "Black", hex: "#000000", label: "#fff", group: "Core" },
  "iron-gray": { name: "Iron Gray", hex: "#6d6e71", label: "#fff", group: "Core" },
  "steel-gray": { name: "Steel Gray", hex: "#e0e0e0", label: "#000", group: "Core" },
  white: { name: "White", hex: "#ffffff", label: "#000", group: "Core" },
  "scots-rose": { name: "Scots Rose", hex: "#ef3a47", label: "#000", group: "Tartan" },
  "gold-thread": { name: "Gold Thread", hex: "#fdb515", label: "#000", group: "Tartan" },
  "green-thread": { name: "Green Thread", hex: "#009647", label: "#000", group: "Tartan" },
  "teal-thread": { name: "Teal Thread", hex: "#008f91", label: "#000", group: "Tartan" },
  "blue-thread": { name: "Blue Thread", hex: "#043673", label: "#fff", group: "Tartan" },
  "highlands-sky-blue": {
    name: "Highlands Sky Blue",
    hex: "#007bc0",
    label: "#fff",
    group: "Tartan",
  },
  "machinery-hall-tan": {
    name: "Machinery Hall Tan",
    hex: "#bcb49e",
    label: "#000",
    group: "Campus",
  },
  "kittanning-brick-beige": {
    name: "Kittanning Brick Beige",
    hex: "#e4dac4",
    label: "#000",
    group: "Campus",
  },
  "hornbostel-teal": { name: "Hornbostel Teal", hex: "#1f4c4c", label: "#fff", group: "Campus" },
  "palladian-green": { name: "Palladian Green", hex: "#719f94", label: "#000", group: "Campus" },
  "weaver-blue": { name: "Weaver Blue", hex: "#182c4b", label: "#fff", group: "Campus" },
  "skibo-red": { name: "Skibo Red", hex: "#941120", label: "#fff", group: "Campus" },
};
export const DEFAULT_COLOR = "iron-gray";

// A solid brand color, Iron Gray unless another is named, with optional
// dimensions scaled to fit even narrow images.
export function solidSvg(w: number, h: number, text: boolean, color = DEFAULT_COLOR): string {
  const { hex, label: ink } = COLORS[color];
  const label = `${w} × ${h}`;
  // The kit uses 32px at 900px wide and 36px for its large hero placeholder.
  // Keep smaller previews readable, then allow room for the label and padding.
  const preferredSize = Math.max(16, Math.min(36, (32 * w) / 900));
  const fontSize = Math.min(preferredSize, w / (label.length * 0.75 + 2), h / 2);
  const baseline = Math.max((70 * h) / 600, fontSize * 1.5);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<rect width="${w}" height="${h}" fill="${hex}"/>` +
    (text
      ? `<text x="${w / 2}" y="${baseline}" fill="${ink}" font-family="Open Sans, Arial, sans-serif" font-size="${fontSize}" text-anchor="middle">${label}</text>`
      : "") +
    "</svg>"
  );
}

// The stacked wordmark on a solid color, three-quarters of the width, a little
// above center (at 41% of the height, as on the 600 × 750 original). In a wide
// image it's centered and fits the height too. With no color it's the bio
// placeholder on CMU's own staff pages: dark gray on gray.
export function wordmarkSvg(w: number, h: number, color?: string): string {
  const bg = color ? COLORS[color].hex : "#a6a6a6";
  const ink = color ? COLORS[color].label : "#6d6e72";
  const ww = 0.73 * Math.min(w, (h * 0.8 * WORDMARK.w) / WORDMARK.h / 1.25);
  const s = ww / WORDMARK.w;
  const cy = h > w ? 0.41 * h : 0.5 * h;
  const x = (w - ww) / 2;
  const y = cy - (WORDMARK.h * s) / 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<rect width="${w}" height="${h}" fill="${bg}"/>` +
    `<g transform="translate(${x} ${y}) scale(${s})" fill="${ink}">${wordmark}</g></svg>`
  );
}

// The drawing as an SVG file
// A measuring grid: labeled cells (A1, A2 … B1 …) at the asked-for size, for
// finding where a service crops an uploaded image, such as the round icon
// Google Drive cuts from a shared drive's theme. Cells are close to square,
// one sixth of the shorter side, so a label stays readable in a small crop.
// Each column has its own hue, and the rows alternate dark and light, so a
// cropped edge is easy to place.
export function gridSvg(w: number, h: number): string {
  const side = Math.min(w, h) / 6;
  const cols = Math.max(1, Math.round(w / side));
  const rows = Math.max(1, Math.round(h / side));
  const cw = w / cols,
    ch = h / rows;
  const font = Math.max(6, Math.min(cw / 3.2, ch * 0.42));
  const rowName = (r: number): string =>
    (r >= 26 ? rowName(Math.floor(r / 26) - 1) : "") + String.fromCharCode(65 + (r % 26));
  const hex = (hue: number, light: number): string => {
    // HSL to RGB, saturation 0.75
    const s = 0.75,
      a = s * Math.min(light, 1 - light);
    const f = (n: number) => {
      const k = (n + hue / 30) % 12;
      return Math.round(255 * (light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
    };
    return "#" + [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, "0")).join("");
  };
  let cells = "";
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x = c * cw,
        y = r * ch;
      cells +=
        `<rect x="${x}" y="${y}" width="${cw}" height="${ch}" fill="${hex((360 * c) / cols, r % 2 ? 0.62 : 0.36)}" stroke="#fff" stroke-width="1"/>` +
        `<text x="${x + cw / 2}" y="${y + ch / 2}" dominant-baseline="central">${rowName(r)}${c + 1}</text>`;
    }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<g font-family="Open Sans, Arial, sans-serif" font-weight="700" font-size="${font}" text-anchor="middle" fill="#fff" stroke="#222" stroke-width="${font / 9}" paint-order="stroke">` +
    cells +
    "</g></svg>"
  );
}

export function svgFile(svg: string): Buffer {
  return Buffer.from(svg);
}

export async function renderSvg(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg)).png().toBuffer();
}
