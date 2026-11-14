import { listPhotos, Photo } from "./widen";

const HOUR = 3600_000;
// While there are no photos, try again this soon, doubling up to the cap
const RETRY_MS = 60_000;
const RETRY_CAP_MS = 15 * 60_000;

// Earliest sig.expires among the preview links, in ms, or null if none parse
export function earliestExpiry(photos: Photo[]): number | null {
  let min: number | null = null;
  for (const p of photos) {
    for (const v of p.previews) {
      const s = Number(new URL(v.url).searchParams.get("sig.expires"));
      if (s > 0 && (min === null || s * 1000 < min)) min = s * 1000;
    }
  }
  return min;
}

// Keeps the photo list in memory. Preview links expire, so it re-lists every
// few hours and ahead of the earliest expiry; nothing is stored on disk.
export class Catalog {
  photos: Photo[] = [];
  refreshedAt: Date | null = null;
  private timer: NodeJS.Timeout | null = null;
  private pending: Promise<void> | null = null;
  private failures = 0;

  constructor(
    private list: () => Promise<Photo[]> = listPhotos,
    private everyMs = HOUR * Number(process.env.REFRESH_HOURS || 6),
  ) {}

  // One refresh at a time; callers during a refresh share it
  refresh(): Promise<void> {
    this.pending ??= this.list()
      .then((photos) => {
        if (!photos.length) throw new Error("Widen returned no photos");
        this.photos = photos;
        this.refreshedAt = new Date();
        this.failures = 0;
      })
      .catch((e: unknown) => {
        this.failures++;
        throw e;
      })
      .finally(() => {
        this.pending = null;
        this.schedule();
      });
    return this.pending;
  }

  count(category: string): number {
    return this.photos.filter((p) => p.categories.includes(category)).length;
  }

  start(): Promise<void> {
    return this.refresh().catch((e) => console.error("catalog refresh failed:", e.message));
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule() {
    this.stop();
    // With no photos every photo request fails, so don't wait hours to retry
    if (!this.photos.length && this.failures) {
      const delay = Math.min(RETRY_MS * 2 ** (this.failures - 1), RETRY_CAP_MS);
      this.timer = setTimeout(() => void this.start(), delay);
      this.timer.unref();
      return;
    }
    let next = Date.now() + this.everyMs;
    const exp = earliestExpiry(this.photos);
    if (exp) next = Math.min(next, exp - 10 * 60_000);
    const delay = Math.max(next - Date.now(), 60_000);
    this.timer = setTimeout(() => void this.start(), delay);
    this.timer.unref();
  }

  // A photo of the same orientation as w x h. The same size always gets the
  // same photo, so browsers and CDNs can cache it: rendezvous hashing scores
  // each photo against the size and takes the best, so adding or removing a
  // photo only moves the sizes that photo wins or loses.
  pick(w: number, h: number, random = false, category?: string): Photo | null {
    const inCategory = category
      ? this.photos.filter((p) => p.categories.includes(category))
      : this.photos;
    const pool = sameOrientation(inCategory, w / h);
    if (!pool.length) return null;
    if (random) return pool[Math.floor(Math.random() * pool.length)];
    let best = pool[0],
      top = -1;
    for (const p of pool) {
      const s = hash(`${w}x${h}:${p.id}`);
      if (s > top) {
        top = s;
        best = p;
      }
    }
    return best;
  }
}

// Wide sizes get landscape photos and tall sizes portrait ones. The portals
// have almost no square photos, so near-square sizes draw from everything.
export function sameOrientation(photos: Photo[], ratio: number): Photo[] {
  const pool =
    ratio > 1.1
      ? photos.filter((p) => p.aspect > 1.1)
      : ratio < 0.9
        ? photos.filter((p) => p.aspect < 0.9)
        : photos;
  return pool.length ? pool : photos;
}

// FNV-1a with a murmur3 finish, so similar strings still score independently
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
