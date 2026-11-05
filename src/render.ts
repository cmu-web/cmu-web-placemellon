import fs from "fs";
import path from "path";
import sharp from "sharp";
import { Photo, Preview } from "./widen";

export const MAX = 2048; // largest Widen preview

const ASSETS = path.join(__dirname, "..", "assets");
const svgInner = (file: string) =>
  fs.readFileSync(path.join(ASSETS, file), "utf8").replace(/^<svg[^>]*>|<\/svg>\s*$/g, "");
const avatar = svgInner("scotty-avatar.svg"); // 320 x 320
const bust = svgInner("scotty-bust.svg"); // viewBox 30 40 268 260
const BUST = { x: 30, y: 40, w: 268, h: 260 };

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
  const res = await get(pickPreview(photo, w, h).url);
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

// Scotty's bust on the avatar's gradient (or plain white), standing on the bottom edge
export function scottySvg(w: number, h: number, white = false): string {
  const s = Math.min((0.9 * w) / BUST.w, (0.9 * h) / BUST.h);
  const x = (w - BUST.w * s) / 2 - BUST.x * s;
  const y = h - BUST.h * s - BUST.y * s;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#c5c6c8"/></linearGradient>` +
    `<clipPath id="crop"><rect x="${BUST.x}" y="${BUST.y}" width="${BUST.w}" height="${BUST.h}"/></clipPath></defs>` +
    `<rect width="${w}" height="${h}" fill="${white ? "#fff" : "url(#bg)"}"/>` +
    `<g transform="translate(${x} ${y}) scale(${s})" clip-path="url(#crop)">${bust}</g></svg>`
  );
}

export function avatarSvg(size: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 320 320">${avatar}</svg>`;
}

// A solid color placeholder, with optional dimensions scaled to fit even narrow images.
export function solidSvg(w: number, h: number, text: boolean): string {
  const label = `${w} × ${h}`;
  // The kit uses 32px at 900px wide and 36px for its large hero placeholder.
  // Keep smaller previews readable, then allow room for the label and padding.
  const preferredSize = Math.max(16, Math.min(36, (32 * w) / 900));
  const fontSize = Math.min(preferredSize, w / (label.length * 0.75 + 2), h / 2);
  const baseline = Math.max((70 * h) / 600, fontSize * 1.5);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<rect width="${w}" height="${h}" fill="#6d6e71"/>` +
    (text
      ? `<text x="${w / 2}" y="${baseline}" fill="#e0e0e0" font-family="Open Sans, Arial, sans-serif" font-size="${fontSize}" text-anchor="middle">${label}</text>`
      : "") +
    "</svg>"
  );
}

// The same image as an SVG file; gray removes its color with a filter
export function svgFile(svg: string, gray: boolean): Buffer {
  if (gray)
    svg = svg.replace(
      /^(<svg[^>]*>)([\s\S]*)(<\/svg>)$/,
      '$1<filter id="pm-gray"><feColorMatrix type="saturate" values="0"/></filter><g filter="url(#pm-gray)">$2</g>$3',
    );
  return Buffer.from(svg);
}

export async function renderSvg(svg: string, gray: boolean): Promise<Buffer> {
  let img = sharp(Buffer.from(svg));
  if (gray) img = img.grayscale();
  return img.png().toBuffer();
}
