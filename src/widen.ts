// Lists photos from UCM's public Widen portals ("CMU Selects"). These are the
// portal app's own endpoints, not a documented API, so expect them to change.

const BASE = "https://cmu.widencollective.com/portals/api";

// Sub-portals linked from the CMU Selects menu (iff7gdfg), which holds no
// photos itself, by the category name used in URLs.
export const PORTALS: Record<string, string> = {
  campus: "qalj0hrs", // Campus Buildings & Points of Interest
  classrooms: "ytqpfqcz", // Academics: Classrooms
  labs: "iux1r8vr", // Academics: Labs & Research
  life: "u1rloihn", // Lifestyle
};

export interface Preview {
  size: number; // bounding box: the longer side is this many pixels
  url: string; // signed widencdn link; expires (sig.expires)
}

export interface Photo {
  id: string; // Widen external_id
  filename: string;
  aspect: number; // width / height
  previews: Preview[]; // smallest first
  categories: string[]; // PORTALS keys; a photo can be in several
}

interface WidenAsset {
  external_id: string;
  filename: string;
  file_properties?: { format_type?: string; image_properties?: { aspect_ratio?: number } | null };
  image_previews?: { thumbnails?: Record<string, string> };
}

interface WidenSection {
  id: string;
  type: string;
}

// How long to wait on CMU Selects before giving up
export const TIMEOUT_MS = 20_000;

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), ...init });
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${url} -> ${res.status}`);
  return (await res.json()) as T;
}

export function toPhoto(a: WidenAsset): Photo | null {
  const aspect = a.file_properties?.image_properties?.aspect_ratio;
  const thumbs = a.image_previews?.thumbnails ?? {};
  if (a.file_properties?.format_type !== "image" || !aspect) return null;
  const previews = Object.entries(thumbs)
    .map(([k, url]) => ({ size: parseInt(k, 10), url }))
    .filter((p) => p.size > 0 && p.url)
    .sort((x, y) => x.size - y.size);
  if (!previews.length) return null;
  return { id: a.external_id, filename: a.filename, aspect, previews, categories: [] };
}

async function sectionAssets(sectionId: string): Promise<WidenAsset[]> {
  const out: WidenAsset[] = [];
  const limit = 100;
  for (let offset = 0; ; offset += limit) {
    const page = await getJson<{ items: WidenAsset[]; total_count: number }>(
      `${BASE}/assets/search/public/section/${sectionId}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expands: "file_properties,image_previews", limit, offset }),
      },
    );
    out.push(...page.items);
    if (!page.items.length || offset + limit >= page.total_count) return out;
  }
}

export async function listPhotos(portals = PORTALS): Promise<Photo[]> {
  const byId = new Map<string, Photo>();
  for (const [category, code] of Object.entries(portals)) {
    const { items } = await getJson<{ items: WidenSection[] }>(
      `${BASE}/view/sections/portal/${code}`,
    );
    for (const s of items.filter((s) => s.type === "Assets")) {
      for (const a of await sectionAssets(s.id)) {
        const p = byId.get(a.external_id) ?? toPhoto(a);
        if (!p) continue;
        if (!p.categories.includes(category)) p.categories.push(category);
        byId.set(p.id, p);
      }
    }
  }
  return [...byId.values()].sort((x, y) => x.id.localeCompare(y.id));
}
