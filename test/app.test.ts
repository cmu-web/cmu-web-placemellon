import sharp from "sharp";
import type { Stream } from "node:stream";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp, Lru, parseSize } from "../src/app";
import { Catalog, earliestExpiry } from "../src/catalog";
import { solidSvg, pickPreview, renderPhoto, renderSvg } from "../src/render";
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
    const plain = await renderSvg(solidSvg(320, 180, false));
    const { channels } = await sharp(plain).removeAlpha().stats();
    expect(channels.slice(0, 3).map((c) => [c.min, c.max])).toEqual([
      [109, 109],
      [110, 110],
      [113, 113],
    ]);
    const labeled = await renderSvg(solidSvg(320, 180, true));
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
      const png = await renderSvg(solidSvg(w, h, true));
      expect(await sharp(png).metadata()).toMatchObject({ width: w, height: h });
    }
  });

  it.each([
    [720, 72, 16, 24],
    [160, 100, 10, 16],
    [900, 600, 20, 28],
    [1400, 700, 24, 30],
  ])("keeps text readable and unclipped at %i × %i", async (w, h, minHeight, maxHeight) => {
    const png = await renderSvg(solidSvg(w, h, true));
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
        sharp(await renderSvg(svg.replace("300 × 200", label)))
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

describe("catalog retries", () => {
  it("tries again within minutes, not hours, while it has no photos", async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const catalog = new Catalog(async () => {
        calls++;
        if (calls === 1) throw new Error("CMU Selects is down");
        return [photo("a")];
      });
      await catalog.start();
      expect(catalog.photos).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(61_000);
      expect(calls).toBe(2);
      expect(catalog.photos).toHaveLength(1);
      catalog.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("timeouts", () => {
  it("gives each CMU Selects image request a time limit", async () => {
    let signal: AbortSignal | null | undefined;
    const get = (async (_url: string, init?: RequestInit) => {
      signal = init?.signal;
      return new Response(await jpeg);
    }) as unknown as typeof fetch;
    await renderPhoto(photo("a"), 60, 40, false, get);
    expect(signal).toBeInstanceOf(AbortSignal);
  });
});

describe("image cache", () => {
  const entry = (n: number) => ({ type: "png", body: Buffer.alloc(n) });
  it("drops the oldest images once they pass the memory limit", () => {
    const lru = new Lru(10, 100);
    lru.set("a", entry(40));
    lru.set("b", entry(40));
    lru.set("c", entry(40));
    expect(lru.get("a")).toBeUndefined();
    expect(lru.get("b")).toBeDefined();
    expect(lru.size).toBe(2);
  });
  it("skips an image bigger than the whole limit, and caches nothing at 0 entries", () => {
    const lru = new Lru(10, 100);
    lru.set("big", entry(200));
    expect(lru.size).toBe(0);
    const off = new Lru(0, 100);
    off.set("a", entry(1));
    expect(off.size).toBe(0);
  });
});

describe("routes", () => {
  it("renders an image once when several requests for it arrive together", async () => {
    let fetches = 0;
    const counting = (async (url: string) => {
      fetches++;
      return fakeFetch(url);
    }) as unknown as typeof fetch;
    const app = createApp(await ready([photo("a")]), counting);
    await Promise.all([1, 2, 3].map(() => request(app).get("/120/80").expect(200)));
    expect(fetches).toBe(1);
  });

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
      ["/90/160?scotty", 90, 160, /svg/],
      ["/600/750?scotty", 600, 750, /svg/],
      ["/600/750.png?scotty&gradient", 600, 750, /png/],
      ["/150.svg?scotty", 150, 150, /svg/],
      ["/64?profile", 64, 64, /svg/],
      ["/48/48?profile", 48, 48, /svg/],
      ["/320/180.png?scotty", 320, 180, /png/],
      ["/64.png?profile", 64, 64, /png/],
      ["/600/750?bio", 600, 750, /svg/],
      ["/800/300.png?bio", 800, 300, /png/],
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

  it("keeps Scotty's red scarf, since grayscale is for photos only", async () => {
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
    expect(await tint("/90/160.png?scotty")).toBeGreaterThan(100);
    for (const path of [
      "/g/90/160?scotty",
      "/90/160.png?scotty&gray",
      "/64?profile&grayscale",
      "/g/64?solid",
      "/120/80?bio&gray",
    ])
      expect((await request(app).get(path).expect(400)).text, path).toContain("photos only");
  });

  it("serves ?scotty on a transparent background and ?scotty&gradient on the gradient", async () => {
    const app = createApp(await ready([photo("a")]), fakeFetch);
    const get = (path: string) => request(app).get(path).buffer(true).parse(binary).expect(200);
    const clear = await get("/120/80.png?scotty");
    const gradient = await get("/120/80.png?scotty&gradient");
    // A bottom corner: see-through without the gradient, light gray with it
    const corner = async (b: Buffer) =>
      sharp(b).extract({ left: 0, top: 79, width: 1, height: 1 }).ensureAlpha().raw().toBuffer();
    expect((await corner(clear.body))[3]).toBe(0);
    const [r, , , alpha] = await corner(gradient.body);
    expect(alpha).toBe(255);
    expect(r).toBeLessThan(240);
  });

  it("serves solid color placeholders without a photo catalog or fetch", async () => {
    const app = createApp(new Catalog(async () => []), (() => {
      throw new Error("Solid color placeholders must not fetch photos");
    }) as typeof fetch);
    // Iron Gray unless a brand color is named
    const iron = [109, 110, 113],
      teal = [0, 143, 145];
    for (const [path, w, h, rgb] of [
      ["/120/80?solid", 120, 80, iron],
      ["/64?solid", 64, 64, iron],
      ["/120/80.svg?solid", 120, 80, iron],
      ["/120/80?solid&color=teal-thread", 120, 80, teal],
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
      expect(channels.slice(0, 3).map((c) => [c.min, c.max])).toEqual(rgb.map((v) => [v, v]));
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
      ["/90/60?solid&bio", 400, "Pick one"],
      ["/90/60?solid&profile", 400, "Pick one"],
      ["/90/60?solid&category=labs", 400, "choose photos"],
      ["/90/60?solid&random", 400, "choose photos"],
      ["/90/60?text", 400, "Use ?text with ?solid"],
      ["/90/60?scotty&text", 400, "Use ?text with ?solid"],
      ["/90/60?white", 400, "Unknown option ?white"],
      ["/90/60?bio&scotty", 400, "Pick one"],
      ["/90/60?scotty&category=labs", 400, "choose photos"],
      ["/90?profile&random", 400, "choose photos"],
      ["/90/60?bio&profile", 400, "Pick one"],
      ["/90/60?gradient", 400, "Use ?gradient with ?scotty"],
      ["/90/60?color=teal-thread", 400, "Use ?color with ?solid"],
      ["/90/60?solid&color=purple", 404, "Use a CMU brand color"],
      ["/90/60?bio&gradient", 400, "Use ?gradient with ?scotty"],
      ["/90/60?bio&category=labs", 400, "choose photos"],
      ["/90/60.jpg?bio", 400, "come as .svg or .png"],
    ];
    for (const [path, status, text] of cases) {
      const res = await request(app).get(path).expect(status);
      expect(res.text, path).toContain(text);
    }
  });

  it("redirects a non-square ?profile to the smaller square", async () => {
    const app = createApp(await ready([photo("a")]), fakeFetch);
    await request(app).get("/96/64?profile").expect(302).expect("Location", "/64?profile");
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
