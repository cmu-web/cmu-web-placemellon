import sharp from "sharp";
import type { Stream } from "node:stream";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp, parseSize } from "../src/app";
import { Catalog, earliestExpiry } from "../src/catalog";
import { solidSvg, pickPreview, renderSvg } from "../src/render";
import { Photo, toPhoto } from "../src/widen";

const photo = (id: string, expires = 1792969200, aspect = 1.5, categories = ["campus"]): Photo => ({
  id,
  filename: `${id}.jpg`,
  aspect,
  categories,
  previews: [300, 600, 2048].map((size) => ({
    size,
    url: `https://cdn.test/${id}/${size}?sig.expires=${expires}`,
  })),
});

const jpeg = sharp({ create: { width: 600, height: 400, channels: 3, background: "#c41230" } })
  .jpeg()
  .toBuffer();

// Fake fetch: serves a red JPEG, or 403 for links containing "stale"
const fakeFetch = (async (url: string) =>
  url.includes("stale")
    ? new Response(null, { status: 403 })
    : new Response(await jpeg)) as unknown as typeof fetch;

async function ready(photos: Photo[] | (() => Photo[])) {
  const catalog = new Catalog(async () => (typeof photos === "function" ? photos() : photos));
  await catalog.refresh();
  catalog.stop();
  return catalog;
}

const binary = (res: Stream, cb: (error: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on("data", (c: Buffer) => chunks.push(c));
  res.on("end", () => cb(null, Buffer.concat(chunks)));
};

describe("parseSize", () => {
  it("accepts 1 to 2048 only", () => {
    expect(parseSize("1")).toBe(1);
    expect(parseSize("2048")).toBe(2048);
    for (const bad of ["0", "2049", "-5", "1.5", "abc", "00001"]) expect(parseSize(bad)).toBeNull();
  });
});

describe("pickPreview", () => {
  it("uses the smallest preview that covers the size", () => {
    expect(pickPreview(photo("a"), 300, 200).size).toBe(300);
    expect(pickPreview(photo("a"), 300, 201).size).toBe(600); // 3:2, so 300 is only 200 tall
    expect(pickPreview(photo("a"), 4000, 10).size).toBe(2048);
  });
});

describe("solid rendering", () => {
  it("renders a uniform gray image or dimensions near the top, including very narrow sizes", async () => {
    const plain = await renderSvg(solidSvg(320, 180, false), false);
    const { channels } = await sharp(plain).removeAlpha().stats();
    expect(channels.slice(0, 3).map((c) => [c.min, c.max])).toEqual([
      [109, 109],
      [110, 110],
      [113, 113],
    ]);
    const labeled = await renderSvg(solidSvg(320, 180, true), false);
    const { data, info } = await sharp(labeled)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const ink = [];
    for (let y = 0; y < info.height; y++)
      for (let x = 0; x < info.width; x++)
        if (data[(y * info.width + x) * info.channels] > 180) ink.push([x, y]);
    expect(ink.length).toBeGreaterThan(0);
    const xs = ink.map(([x]) => x),
      ys = ink.map(([, y]) => y);
    expect(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - 160)).toBeLessThan(5);
    expect(Math.min(...ys)).toBeGreaterThan(0);
    expect(Math.max(...ys)).toBeLessThan(info.height / 5);
    for (const [w, h] of [
      [1, 2048],
      [2048, 1],
      [1, 1],
    ]) {
      const png = await renderSvg(solidSvg(w, h, true), false);
      expect(await sharp(png).metadata()).toMatchObject({ width: w, height: h });
    }
  });

  it.each([
    [720, 72, 16, 24],
    [160, 100, 10, 16],
    [900, 600, 20, 28],
    [1400, 700, 24, 30],
  ])("keeps text readable and unclipped at %i × %i", async (w, h, minHeight, maxHeight) => {
    const png = await renderSvg(solidSvg(w, h, true), false);
    const { data, info } = await sharp(png)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const xs: number[] = [],
      ys: number[] = [];
    for (let y = 0; y < info.height; y++)
      for (let x = 0; x < info.width; x++)
        if (data[(y * info.width + x) * info.channels] > 180) {
          xs.push(x);
          ys.push(y);
        }
    expect(ys.length).toBeGreaterThan(0);
    const inkHeight = Math.max(...ys) - Math.min(...ys) + 1;
    expect(inkHeight).toBeGreaterThanOrEqual(minHeight);
    expect(inkHeight).toBeLessThanOrEqual(maxHeight);
    expect(Math.min(...ys)).toBeGreaterThan(0);
    expect(Math.max(...ys)).toBeLessThan(h - 1);
    expect(Math.min(...xs)).toBeGreaterThan(0);
    expect(Math.max(...xs)).toBeLessThan(w - 1);
    expect(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - w / 2)).toBeLessThan(5);
  });

  it("draws the dimensions in a real font, not missing-glyph boxes", async () => {
    // Without the font, every digit is the same box, so these come out identical
    const svg = solidSvg(300, 200, true);
    const [ones, eights] = await Promise.all(
      ["111 × 111", "888 × 888"].map(async (label) =>
        sharp(await renderSvg(svg.replace("300 × 200", label), false))
          .raw()
          .toBuffer(),
      ),
    );
    expect(ones.equals(eights)).toBe(false);
  });
});

describe("widen", () => {
  it("skips videos and sorts previews", () => {
    const base = {
      external_id: "x",
      filename: "x.jpg",
      image_previews: { thumbnails: { "600px": "u6", "125px": "u1" } },
    };
    expect(toPhoto({ ...base, file_properties: { format_type: "video" } })).toBeNull();
    const p = toPhoto({
      ...base,
      file_properties: { format_type: "image", image_properties: { aspect_ratio: 1.5 } },
    });
    expect(p?.previews.map((v) => v.size)).toEqual([125, 600]);
  });

  it("finds the earliest link expiry", () => {
    expect(earliestExpiry([photo("a", 200), photo("b", 100)])).toBe(100_000);
  });
});

describe("pick", () => {
  const ids = Array.from({ length: 50 }, (_, i) => `p${i}`);
  const sizes = Array.from({ length: 300 }, (_, i) => [100 + i, 80 + (i % 40)] as const);

  it("matches orientation, falling back to everything", async () => {
    const c = await ready([photo("wide", 1, 1.5), photo("tall", 1, 0.67)]);
    expect(c.pick(400, 200)?.id).toBe("wide");
    expect(c.pick(200, 400)?.id).toBe("tall");
    const onlyWide = await ready([photo("wide", 1, 1.5)]);
    expect(onlyWide.pick(200, 400)?.id).toBe("wide");
  });

  it("spreads sizes across photos", async () => {
    const c = await ready(ids.map((id) => photo(id)));
    expect(new Set(sizes.map(([w, h]) => c.pick(w, h)!.id)).size).toBeGreaterThan(40);
  });

  it("moves only the sizes a removed photo had", async () => {
    const all = await ready(ids.map((id) => photo(id)));
    const fewer = await ready(ids.filter((id) => id !== "p7").map((id) => photo(id)));
    for (const [w, h] of sizes) {
      const before = all.pick(w, h)!.id;
      if (before !== "p7") expect(fewer.pick(w, h)!.id).toBe(before);
    }
  });

  it("picks at random on request", async () => {
    const c = await ready(ids.map((id) => photo(id)));
    expect(
      new Set(Array.from({ length: 40 }, () => c.pick(300, 200, true)!.id)).size,
    ).toBeGreaterThan(5);
  });
});

describe("routes", () => {
  it("crops a photo to size, the same photo each time", async () => {
    const app = createApp(await ready([photo("a"), photo("b"), photo("c")]), fakeFetch);
    const res = await request(app)
      .get("/250/100")
      .buffer(true)
      .parse(binary)
      .expect(200)
      .expect("Content-Type", /jpeg/);
    expect(await sharp(res.body).metadata()).toMatchObject({ width: 250, height: 100 });
    const again = await request(app).get("/250/100").expect(200);
    expect(again.headers["x-photo"]).toBe(res.headers["x-photo"]);
  });

  it("makes /g/ and ?gray grayscale, the same image", async () => {
    const app = createApp(await ready([photo("a")]), fakeFetch);
    const a = await request(app).get("/g/50/50").buffer(true).parse(binary).expect(200);
    const b = await request(app).get("/50/50?gray").buffer(true).parse(binary).expect(200);
    const { channels } = await sharp(a.body).stats();
    expect(Math.abs(channels[0].mean - channels[1].mean)).toBeLessThan(1);
    expect(Buffer.compare(a.body, b.body)).toBe(0);
  });

  it("treats /{size} as square", async () => {
    const app = createApp(await ready([photo("a")]), fakeFetch);
    const res = await request(app).get("/70").buffer(true).parse(binary).expect(200);
    expect(await sharp(res.body).metadata()).toMatchObject({ width: 70, height: 70 });
  });

  it("serves ?scotty and ?profile as SVG at the asked size, or PNG with .png", async () => {
    const app = createApp(await ready([photo("a")]), fakeFetch);
    for (const [path, w, h, type] of [
      ["/320/180?scotty", 320, 180, /svg/],
      ["/g/90/160?scotty", 90, 160, /svg/],
      ["/150?scotty&white", 150, 150, /svg/],
      ["/150.svg?scotty&white", 150, 150, /svg/],
      ["/64?profile", 64, 64, /svg/],
      ["/48/48?profile&grayscale", 48, 48, /svg/],
      ["/320/180.png?scotty", 320, 180, /png/],
      ["/g/64.png?profile", 64, 64, /png/],
    ] as const) {
      const res = await request(app)
        .get(path)
        .buffer(true)
        .parse(binary)
        .expect(200)
        .expect("Content-Type", type);
      expect(await sharp(res.body).metadata(), path).toMatchObject({ width: w, height: h });
    }
  });

  it("takes the color out of gray SVG and PNG alike", async () => {
    const app = createApp(await ready([photo("a")]), fakeFetch);
    // The most any pixel's red differs from its green: big for the red scarf, 0 in gray
    const tint = async (path: string) => {
      const res = await request(app).get(path).buffer(true).parse(binary).expect(200);
      const px = await sharp(res.body).removeAlpha().raw().toBuffer();
      let most = 0;
      for (let k = 0; k < px.length; k += 3) most = Math.max(most, Math.abs(px[k] - px[k + 1]));
      return most;
    };
    expect(await tint("/90/160?scotty")).toBeGreaterThan(100);
    expect(await tint("/g/90/160?scotty")).toBeLessThan(3);
    expect(await tint("/90/160.png?scotty&gray")).toBeLessThan(3);
  });

  it("serves ?scotty&white on white, cached apart from the gradient", async () => {
    const app = createApp(await ready([photo("a")]), fakeFetch);
    const get = (path: string) => request(app).get(path).buffer(true).parse(binary).expect(200);
    const plain = await get("/120/80?scotty");
    const white = await get("/120/80?scotty&white");
    expect(white.body.equals(plain.body)).toBe(false);
    // The bottom corners are gray on the gradient and white without it
    const corner = async (b: Buffer) =>
      (
        await sharp(b)
          .extract({ left: 0, top: 79, width: 1, height: 1 })
          .removeAlpha()
          .raw()
          .toBuffer()
      )[0];
    expect(await corner(white.body)).toBe(255);
    expect(await corner(plain.body)).toBeLessThan(220);
  });

  it("serves solid color placeholders without a photo catalog or fetch", async () => {
    const app = createApp(new Catalog(async () => []), (() => {
      throw new Error("Solid color placeholders must not fetch photos");
    }) as typeof fetch);
    for (const [path, w, h] of [
      ["/120/80?solid", 120, 80],
      ["/64?solid", 64, 64],
      ["/g/64?solid", 64, 64],
      ["/120/80?solid&gray", 120, 80],
      ["/120/80.svg?solid", 120, 80],
    ] as const) {
      const res = await request(app)
        .get(path)
        .buffer(true)
        .parse(binary)
        .expect(200)
        .expect("Content-Type", /svg/)
        .expect("Content-Security-Policy", "default-src 'none'")
        .expect("Cache-Control", "public, max-age=86400");
      expect(res.headers["x-photo"]).toBeUndefined();
      expect(await sharp(res.body).metadata()).toMatchObject({ width: w, height: h });
      const { channels } = await sharp(res.body).removeAlpha().stats();
      expect(channels.slice(0, 3).map((c) => [c.min, c.max])).toEqual([
        [109, 109],
        [110, 110],
        [113, 113],
      ]);
    }
  });

  it("serves a solid color as PNG with .png, cached apart from the SVG", async () => {
    const app = createApp(new Catalog(async () => []), fakeFetch);
    const get = (path: string) => request(app).get(path).buffer(true).parse(binary).expect(200);
    const png = await get("/120/80.png?solid&text");
    expect(png.headers["content-type"]).toMatch(/png/);
    expect(await sharp(png.body).metadata()).toMatchObject({
      format: "png",
      width: 120,
      height: 80,
    });
    expect((await get("/120/80?solid&text")).headers["content-type"]).toMatch(/svg/);
  });

  it("takes .jpg or .webp for photos and .svg or .png only for drawn images", async () => {
    const app = createApp(await ready([photo("a")]), fakeFetch);
    await request(app).get("/90/60.jpg").expect(200).expect("Content-Type", /jpeg/);
    await request(app).get("/g/60.jpg").expect(200).expect("Content-Type", /jpeg/);
    await request(app).get("/90/60.webp").expect(200).expect("Content-Type", /webp/);
    await request(app).get("/g/60.webp").expect(200).expect("Content-Type", /webp/);
    for (const [path, text] of [
      ["/90/60.png", "Photos come as JPEG or WebP"],
      ["/90/60.svg?category=labs", "Photos come as JPEG or WebP"],
      ["/90/60.jpg?solid", "come as .svg or .png"],
      ["/90.jpg?scotty", "come as .svg or .png"],
      ["/90.webp?profile", "come as .svg or .png"],
      ["/90/60.gif?solid", "Sizes must be"],
      ["/90.png/60?solid", "Sizes must be"],
    ]) {
      const res = await request(app).get(path).expect(400);
      expect(res.text, path).toContain(text);
    }
  });

  it("adds optional dimension text and caches it separately from the plain image", async () => {
    const app = createApp(new Catalog(async () => []), fakeFetch);
    const plain = await request(app).get("/320/180?solid").buffer(true).parse(binary).expect(200);
    const text = await request(app)
      .get("/320/180?solid&text")
      .buffer(true)
      .parse(binary)
      .expect(200);
    expect(await sharp(text.body).metadata()).toMatchObject({ width: 320, height: 180 });
    expect(text.body.equals(plain.body)).toBe(false);
    const { channels } = await sharp(text.body).removeAlpha().stats();
    expect(channels[0].max).toBeGreaterThan(180);
    const again = await request(app)
      .get("/320/180?text&solid")
      .buffer(true)
      .parse(binary)
      .expect(200);
    expect(again.body.equals(text.body)).toBe(true);
    const stillPlain = await request(app)
      .get("/320/180?solid")
      .buffer(true)
      .parse(binary)
      .expect(200);
    expect(stillPlain.body.equals(plain.body)).toBe(true);
    for (const [w, h] of [
      [1, 2048],
      [2048, 1],
      [1, 1],
    ]) {
      const tiny = await request(app)
        .get(`/${w}/${h}?solid&text`)
        .buffer(true)
        .parse(binary)
        .expect(200);
      expect(await sharp(tiny.body).metadata()).toMatchObject({ width: w, height: h });
    }
  });

  it("doesn't cache ?random, whatever its value", async () => {
    const app = createApp(
      await ready(Array.from({ length: 30 }, (_, i) => photo(`p${i}`))),
      fakeFetch,
    );
    const seen = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .get(`/60/40?random=${i % 2}`)
        .expect(200)
        .expect("Cache-Control", "no-store");
      seen.add(res.headers["x-photo"]);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("narrows to a ?category, in color or gray", async () => {
    const app = createApp(
      await ready([photo("q", 1, 1.5, ["campus"]), photo("l", 1, 1.5, ["labs", "life"])]),
      fakeFetch,
    );
    for (const [path, want] of [
      ["/90/60?category=campus", "q.jpg"],
      ["/90/60?category=labs", "l.jpg"],
      ["/g/90/60?category=life&random", "l.jpg"],
    ]) {
      const res = await request(app).get(path).expect(200);
      expect(res.headers["x-photo"], path).toBe(want);
    }
    await request(app).get("/90/60?category=classrooms").expect(503); // none in this catalog
    const health = await request(app).get("/healthz").expect(200);
    expect(health.body.categories).toEqual({ campus: 1, classrooms: 0, labs: 1, life: 1 });
  });

  it("says what's wrong with bad options", async () => {
    const app = createApp(await ready([photo("a")]), fakeFetch);
    const cases: [string, number, string][] = [
      ["/90/60?category=dogs", 404, "campus, classrooms, labs, life"],
      ["/90/60?categroy=labs", 400, "Unknown option ?categroy"],
      ["/90/60?category=labs&category=life", 400, "once"],
      ["/90/60?scotty&profile", 400, "Pick one"],
      ["/90/60?solid&scotty", 400, "Pick one"],
      ["/90/60?solid&profile", 400, "Pick one"],
      ["/90/60?solid&category=labs", 400, "choose photos"],
      ["/90/60?solid&random", 400, "choose photos"],
      ["/90/60?text", 400, "Use ?text with ?solid"],
      ["/90/60?scotty&text", 400, "Use ?text with ?solid"],
      ["/90/60?white", 400, "Use ?white with ?scotty"],
      ["/90/60?profile&white", 400, "Use ?white with ?scotty"],
      ["/90/60?scotty&category=labs", 400, "choose photos"],
      ["/90?profile&random", 400, "choose photos"],
    ];
    for (const [path, status, text] of cases) {
      const res = await request(app).get(path).expect(status);
      expect(res.text, path).toContain(text);
    }
  });

  it("redirects a non-square ?profile to the smaller square", async () => {
    const app = createApp(await ready([photo("a")]), fakeFetch);
    await request(app).get("/96/64?profile").expect(302).expect("Location", "/64?profile");
    await request(app)
      .get("/g/50/80?gray&profile")
      .expect(302)
      .expect("Location", "/g/50?gray&profile");
    await request(app).get("/96/64.png?profile").expect(302).expect("Location", "/64.png?profile");
  });

  it("serves the bundled docs at /", async () => {
    const catalog = await ready([photo("a")]);
    const res = await request(createApp(catalog, fakeFetch))
      .get("/")
      .expect(200)
      .expect("Content-Type", /html/);
    expect(res.text).toContain("<title>PlaceMellon");
    await request(createApp(catalog, fakeFetch)).get("/js/docs.js").expect(200);
  });

  it("rejects bad sizes", async () => {
    const app = createApp(await ready([photo("a")]), fakeFetch);
    for (const path of ["/0/10", "/10/3000", "/0?profile", "/x/10?scotty", "/g/abc"])
      await request(app).get(path).expect(400);
  });

  it("re-lists once when preview links have expired", async () => {
    let calls = 0;
    const catalog = await ready(() => (++calls === 1 ? [photo("stale")] : [photo("fresh")]));
    const res = await request(createApp(catalog, fakeFetch)).get("/40/40").expect(200);
    expect(res.headers["x-photo"]).toBe("fresh.jpg");
    catalog.stop();
  });

  it("says 503 until photos have loaded", async () => {
    const app = createApp(new Catalog(async () => []), fakeFetch);
    await request(app).get("/40/40").expect(503);
    await request(app).get("/healthz").expect(503);
    await request(app).get("/40/40?scotty").expect(200);
  });
});
