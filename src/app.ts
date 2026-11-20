import express, { Request, Response } from "express";
import path from "path";
import { Catalog } from "./catalog";
import {
  profileSvg,
  wordmarkSvg,
  gridSvg,
  COLORS,
  DEFAULT_COLOR,
  solidSvg,
  MAX,
  renderPhoto,
  renderSvg,
  scottySvg,
  questionSvg,
  svgFile,
  StaleLinkError,
} from "./render";
import { PORTALS } from "./widen";

const OPTIONS = [
  "category",
  "photo",
  "random",
  "scotty",
  "question",
  "solid",
  "wordmark",
  "bio",
  "profile",
  "text",
  "color",
  "gradient",
  "gray",
  "grayscale",
  // A measuring grid, for finding where a service crops an image. The Cut
  // & Paste documents it; PlaceMellon's own pages and errors don't list it.
  "grid",
];
const LISTED = OPTIONS.filter((o) => o !== "grid");

// The Scotty art. The value names the art; ?question and ?gradient add to it.
const SCOTTY = ["bust", "profile", "recumbent", "rampant"] as const;
export type Scotty = (typeof SCOTTY)[number];

export interface Options {
  category?: string;
  photo?: string;
  random: boolean;
  scotty?: Scotty;
  question: boolean;
  solid: boolean;
  wordmark: boolean;
  text: boolean;
  color?: string;
  gradient: boolean;
  gray: boolean;
  grid: boolean;
}

export class OptionError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// Reads the query string; rejects unknown options and ones that don't go together
export function parseOptions(query: Record<string, unknown>, gray = false): Options {
  const unknown = Object.keys(query).filter((k) => !OPTIONS.includes(k));
  if (unknown.length)
    throw new OptionError(
      400,
      `Unknown option ?${unknown[0]}. Options: ${LISTED.map((o) => "?" + o).join(", ")}.`,
    );
  const category = query.category;
  if (category !== undefined && typeof category !== "string")
    throw new OptionError(400, "Give ?category once.");
  if (category !== undefined && !(category in PORTALS))
    throw new OptionError(
      404,
      `No category "${category}". Try ${Object.keys(PORTALS).join(", ")}.`,
    );
  const photo = query.photo;
  if (photo !== undefined && (typeof photo !== "string" || !photo))
    throw new OptionError(400, "Give ?photo once, with a photo's name.");
  const color = query.color;
  if (color !== undefined && typeof color !== "string")
    throw new OptionError(400, "Give ?color once.");
  if (color !== undefined && !(color in COLORS))
    throw new OptionError(
      404,
      `No color "${color}". Use a CMU brand color: ${Object.keys(COLORS).join(", ")}.`,
    );
  const question = "question" in query;
  // Production Assets' addresses name a purpose, so each can change on its own,
  // and only that page shows them, so the server logs show which live sites
  // use each: ?bio (a bio page, now ?solid&wordmark), ?bio=list (a person in
  // a list of people, now ?scotty=profile) and ?profile (the signed-in user's
  // picture, now ?scotty=profile).
  const bio = query.bio;
  if (bio !== undefined && typeof bio !== "string") throw new OptionError(400, "Give ?bio once.");
  if (bio !== undefined && !["", "page", "list"].includes(bio))
    throw new OptionError(404, `No ?bio=${bio}. Use ?bio for a bio page or ?bio=list for a list.`);
  const bioList = bio === "list";
  let scotty: Scotty | undefined;
  if (bioList) {
    if ("scotty" in query || "profile" in query)
      throw new OptionError(400, "Pick one of ?bio, ?profile or ?scotty.");
    scotty = "profile";
  } else if ("profile" in query) {
    if ("scotty" in query) throw new OptionError(400, "Pick one of ?profile or ?scotty.");
    scotty = "profile";
  } else if ("scotty" in query) {
    const v = query.scotty;
    if (typeof v !== "string") throw new OptionError(400, "Give ?scotty once.");
    // Undocumented: plain ?scotty draws the bust, and with ?question the play bow
    const named = v === "" ? (question ? "recumbent" : "bust") : v;
    if (!(SCOTTY as readonly string[]).includes(named))
      throw new OptionError(404, `No ?scotty=${v}. Try ${SCOTTY.join(", ")}.`);
    scotty = named as Scotty;
  }
  const o: Options = {
    category,
    photo,
    color,
    random: "random" in query,
    scotty,
    question,
    solid: "solid" in query || (bio !== undefined && !bioList),
    wordmark: "wordmark" in query || (bio !== undefined && !bioList),
    text: "text" in query,
    gradient: "gradient" in query,
    gray: gray || "gray" in query || "grayscale" in query,
    grid: "grid" in query,
  };
  // A measuring grid is its own image: nothing else goes with it
  if (o.grid && Object.keys(query).some((k) => k !== "grid"))
    throw new OptionError(400, "Use ?grid on its own.");
  if (o.grid && gray) throw new OptionError(400, "Use ?grid on its own, without /g/.");
  if (o.scotty && o.solid) throw new OptionError(400, "Pick one of ?scotty or ?solid.");
  if ((o.scotty || o.solid) && (o.category || o.random || o.photo))
    throw new OptionError(
      400,
      "?category, ?photo and ?random choose photos, so they don't go with ?scotty or ?solid.",
    );
  if (o.photo && o.random) throw new OptionError(400, "Pick one of ?photo or ?random.");
  if (o.question && o.scotty !== "recumbent" && o.scotty !== "rampant")
    throw new OptionError(400, "Use ?question with ?scotty=recumbent or ?scotty=rampant.");
  // Scotty alone in these poses is still to come
  if (o.gradient && o.scotty !== "bust")
    throw new OptionError(400, "Use ?gradient with ?scotty=bust.");
  if (o.wordmark && !o.solid) throw new OptionError(400, "Use ?wordmark with ?solid.");
  if (o.text && !o.solid) throw new OptionError(400, "Use ?text with ?solid.");
  if (o.text && o.wordmark) throw new OptionError(400, "Pick one of ?text or ?wordmark.");
  if (o.color && !o.solid) throw new OptionError(400, "Use ?color with ?solid.");
  // Grayscale is for photos; the drawn images are already flat colors
  if (o.gray && (o.scotty || o.solid))
    throw new OptionError(400, "Use ?gray (or /g/) with photos only.");
  return o;
}

interface Rendered {
  type: string;
  body: Buffer;
  photo?: string;
}

// Rendered images, newest last; the oldest go first when there are too many
// or they take too much memory
export class Lru {
  private map = new Map<string, Rendered>();
  private bytes = 0;
  constructor(
    private maxEntries: number,
    private maxBytes: number,
  ) {}
  get size() {
    return this.map.size;
  }
  get(k: string) {
    const v = this.map.get(k);
    if (v) {
      this.map.delete(k);
      this.map.set(k, v);
    }
    return v;
  }
  set(k: string, v: Rendered) {
    if (v.body.length > this.maxBytes || this.maxEntries < 1) return;
    const old = this.map.get(k);
    if (old) {
      this.bytes -= old.body.length;
      this.map.delete(k);
    }
    this.map.set(k, v);
    this.bytes += v.body.length;
    while (this.map.size > this.maxEntries || this.bytes > this.maxBytes) {
      const [oldest, entry] = this.map.entries().next().value!;
      this.map.delete(oldest);
      this.bytes -= entry.body.length;
    }
  }
}

// A last size ending in .svg, .png, .jpg or .webp picks the file type
export function splitExt(s: string): [string, Ext | undefined] {
  const m = /^(.*)\.(svg|png|jpg|webp)$/.exec(s);
  return m ? [m[1], m[2] as Ext] : [s, undefined];
}
type Ext = "svg" | "png" | "jpg" | "webp";

export function parseSize(s: string): number | null {
  if (!/^\d{1,4}$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && n <= MAX ? n : null;
}

export function createApp(catalog: Catalog, get: typeof fetch = fetch) {
  const app = express();
  const cache = new Lru(
    Number(process.env.CACHE_ENTRIES ?? 256),
    Number(process.env.CACHE_MB ?? 64) * 1024 * 1024,
  );
  // Renders in progress, so requests for the same image share one
  const inFlight = new Map<string, Promise<Rendered>>();

  app.use(express.static(path.join(__dirname, "..", "docs"), { index: "index.html" }));

  app.get("/healthz", (_req, res) => {
    const categories = Object.fromEntries(Object.keys(PORTALS).map((c) => [c, catalog.count(c)]));
    res
      .status(catalog.photos.length ? 200 : 503)
      .json({ photos: catalog.photos.length, categories, refreshedAt: catalog.refreshedAt });
  });

  // Random images skip the cache, ours and everyone else's
  async function send(res: Response, key: string | null, make: () => Promise<Rendered>) {
    let out = key ? cache.get(key) : undefined;
    if (!out) {
      let job = key ? inFlight.get(key) : undefined;
      if (!job) {
        job = make();
        if (key) {
          const k = key;
          inFlight.set(k, job);
          void job
            .then((r) => cache.set(k, r))
            .catch(() => {})
            .finally(() => inFlight.delete(k));
        }
      }
      try {
        out = await job;
      } catch (e) {
        console.error(key ?? "random", (e as Error).message);
        res.status(502).type("text/plain").send("Couldn't get that image. Try again shortly.\n");
        return;
      }
    }
    if (out.photo) res.set("X-Photo", out.photo);
    if (out.type === "svg") res.set("Content-Security-Policy", "default-src 'none'");
    // Browsers keep an image a day, except random photos, and except in
    // development, where an image's address can stay the same while its
    // drawing changes
    const keep = key && process.env.NODE_ENV !== "development";
    res
      .set("Cache-Control", keep ? "public, max-age=86400" : "no-store")
      .type(out.type)
      .send(out.body);
  }

  const image = (gray: boolean) => (req: Request<{ w: string; h?: string }>, res: Response) => {
    const [ws, wExt] = req.params.h === undefined ? splitExt(req.params.w) : [req.params.w];
    const [hs, hExt] = req.params.h === undefined ? [] : splitExt(req.params.h);
    const ext = wExt ?? hExt;
    const w = parseSize(ws),
      h = hs === undefined ? w : parseSize(hs);
    if (w === null || h === null) {
      res.status(400).type("text/plain").send(`Sizes must be whole numbers from 1 to ${MAX}.\n`);
      return;
    }
    let o: Options;
    try {
      o = parseOptions(req.query, gray);
    } catch (e) {
      if (!(e instanceof OptionError)) throw e;
      res
        .status(e.status)
        .type("text/plain")
        .send(e.message + "\n");
      return;
    }

    // Profile pictures are square: send /96/64?scotty=profile to /64?scotty=profile
    if (o.scotty === "profile" && w !== h) {
      const qs = req.originalUrl.slice(req.originalUrl.indexOf("?"));
      res.redirect(302, `${gray ? "/g" : ""}/${Math.min(w, h)}${ext ? "." + ext : ""}${qs}`);
      return;
    }

    // Drawn images are SVG unless .png is asked for; photos are JPEGs unless
    // .webp is asked for
    const drawn = o.solid || o.scotty || o.grid;
    if (drawn && (ext === "jpg" || ext === "webp")) {
      res
        .status(400)
        .type("text/plain")
        .send("Scotty, solid colors and grids come as .svg or .png.\n");
      return;
    }
    if (!drawn && (ext === "svg" || ext === "png")) {
      res
        .status(400)
        .type("text/plain")
        .send("Photos come as JPEG or WebP: use .jpg, .webp or no extension.\n");
      return;
    }
    const png = ext === "png";
    const draw = async (svg: string): Promise<Rendered> =>
      png ? { type: "png", body: await renderSvg(svg) } : { type: "svg", body: svgFile(svg) };

    if (o.grid) {
      void send(res, `grid ${w}x${h}${png ? " png" : ""}`, () => draw(gridSvg(w, h)));
      return;
    }

    if (o.solid) {
      const c = o.color ?? "";
      const extra = o.text ? " text" : o.wordmark ? " wordmark" : "";
      const key = `solid ${w}x${h} ${c}${extra}${png ? " png" : ""}`;
      const svg = o.wordmark
        ? wordmarkSvg(w, h, o.color)
        : solidSvg(w, h, o.text, o.color ?? DEFAULT_COLOR);
      void send(res, key, () => draw(svg));
      return;
    }

    if (o.scotty) {
      const s = o.scotty;
      const svg =
        s === "profile"
          ? profileSvg(w)
          : !o.question
            ? scottySvg(w, h, o.gradient, s)
            : questionSvg(w, h, s === "rampant");
      const key = `scotty=${s} ${w}x${h}${o.question ? " question" : ""}${o.gradient ? " gradient" : ""}${png ? " png" : ""}`;
      void send(res, key, () => draw(svg));
      return;
    }

    if (!catalog.photos.length || (o.category && !catalog.count(o.category))) {
      res.status(503).type("text/plain").send("Photos are still loading. Try again shortly.\n");
      return;
    }
    const webp = ext === "webp",
      type = webp ? "webp" : "jpeg";
    // ?photo names one photo. If it has left CMU Selects (CMU may have pulled
    // it), it's never served: the usual pick for the size and category stands
    // in, and X-Photo-Missing says so.
    const choose = () =>
      (o.photo && catalog.find(o.photo)) || catalog.pick(w, h, o.random, o.category)!;
    if (o.photo && !catalog.find(o.photo)) res.set("X-Photo-Missing", o.photo);
    const key = o.random
      ? null
      : `photo ${w}x${h} ${o.photo ? "photo=" + choose().id : (o.category ?? "all")}${o.gray ? " gray" : ""}${webp ? " webp" : ""}`;
    void send(res, key, async () => {
      let p = choose();
      try {
        return { type, body: await renderPhoto(p, w, h, o.gray, get, webp), photo: p.filename };
      } catch (e) {
        if (!(e instanceof StaleLinkError)) throw e;
        // Preview links expired early; re-list and try once more
        await catalog.refresh();
        p = choose();
        return { type, body: await renderPhoto(p, w, h, o.gray, get, webp), photo: p.filename };
      }
    });
  };

  // /g/ first, or /:w/:h would read /g/400 as a width of "g"
  app.get(["/g/:w", "/g/:w/:h"], image(true));
  app.get(["/:w", "/:w/:h"], image(false));

  return app;
}
