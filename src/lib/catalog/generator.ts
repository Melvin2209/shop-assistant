import type { Category, Product, Review, SpecValue } from "./types";
import { CATEGORIES } from "./types";

/**
 * Deterministic generator for the fictional catalog.
 *
 * Everything (brands, specs, prices, reviews) is invented. A seeded PRNG makes
 * the output reproducible: running the script twice gives the same JSON, so
 * tests and eval expectations stay stable.
 */

/** mulberry32: tiny, fast, seedable PRNG returning floats in [0, 1). */
export function createRng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)],
    chance: (p: number) => next() < p,
  };
}

type Rng = ReturnType<typeof createRng>;

interface Draft {
  specs: Record<string, SpecValue>;
  basePrice: number;
  tags: string[];
  /** Short phrases used to write the description and the reviews. */
  highlight: string;
  weakness: string;
}

const BRANDS: Record<Category, string[]> = {
  laptop: ["Novatek", "Lumio", "Arcadia", "Kestrel"],
  smartphone: ["Pixelon", "Orbis", "Novatek", "Vela"],
  headphones: ["Zephyr Audio", "Soniq", "Kestrel", "Lumio"],
  tv: ["Visionary", "Orbis", "Lumio", "Pixelon"],
  tablet: ["Lumio", "Orbis", "Novatek", "Vela"],
  smartwatch: ["Pulsar", "Orbis", "Vela", "Kestrel"],
  camera: ["Optiq", "Kestrel", "Arcadia", "Pixelon"],
  speaker: ["Soniq", "Zephyr Audio", "Voltra", "Lumio"],
};

const LINES: Record<Category, string[]> = {
  laptop: ["Aero", "Forge", "Slate", "Nimbus"],
  smartphone: ["Nova", "Edge", "Pulse", "Lite"],
  headphones: ["Hush", "Beat", "Flow", "Studio"],
  tv: ["Cinema", "Vista", "Prism", "Horizon"],
  tablet: ["Tab", "Canvas", "Pad", "Note"],
  smartwatch: ["Fit", "Trail", "Core", "Active"],
  camera: ["Alpha", "Snap", "Frame", "Venture"],
  speaker: ["Boom", "Echo", "Wave", "Bar"],
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Retail-style price ending in .99, e.g. 1234 -> 1229.99 */
function retailPrice(raw: number): number {
  const tens = Math.max(1, Math.round(raw / 10));
  return tens * 10 - 0.01;
}

const DRAFTERS: Record<Category, (rng: Rng) => Draft> = {
  laptop: (rng) => {
    const ram = rng.pick([8, 16, 16, 32, 64]);
    const storage = rng.pick([256, 512, 512, 1024, 2048]);
    const screen = rng.pick([13.3, 14, 15.6, 16]);
    const gpu = rng.chance(0.35) ? "dedicated" : "integrated";
    const weight = round1(screen < 14.5 ? 1.0 + rng.next() * 0.6 : 1.6 + rng.next() * 1.0);
    const battery = rng.int(6, 20);
    const specs = {
      screen_inches: screen,
      processor: rng.pick(["6-core", "8-core", "10-core", "12-core", "16-core"]),
      ram_gb: ram,
      storage_gb: storage,
      gpu,
      battery_hours: battery,
      weight_kg: weight,
      os: rng.pick(["Windows", "Windows", "Linux", "ChromeOS"]),
    };
    const tags = [];
    if (gpu === "dedicated" && ram >= 16) tags.push("gaming");
    if (weight < 1.4) tags.push("ultralight", "travel");
    if (ram >= 32) tags.push("creator");
    if (battery >= 14) tags.push("long battery");
    return {
      specs,
      basePrice: 350 + ram * 12 + storage * 0.25 + (gpu === "dedicated" ? 450 : 0) + (weight < 1.4 ? 150 : 0),
      tags,
      highlight: battery >= 14 ? "the battery easily lasts a full day" : `the ${screen}" screen is sharp`,
      weakness: weight > 2 ? "it is heavy to carry around" : "the speakers are a bit weak",
    };
  },
  smartphone: (rng) => {
    const storage = rng.pick([128, 128, 256, 512, 1024]);
    const camera = rng.pick([48, 50, 64, 108, 200]);
    const battery = rng.int(38, 55) * 100;
    const specs = {
      screen_inches: rng.pick([6.1, 6.3, 6.5, 6.7, 6.9]),
      storage_gb: storage,
      ram_gb: rng.pick([6, 8, 12, 16]),
      camera_mp: camera,
      battery_mah: battery,
      has_5g: rng.chance(0.85),
      water_resistance: rng.pick(["IP67", "IP68", "IP68", "none"]),
      os: rng.pick(["Android", "Android", "OrbitOS"]),
    };
    const tags = [];
    if (camera >= 108) tags.push("photography");
    if (battery >= 5000) tags.push("long battery");
    if (storage <= 128) tags.push("budget");
    return {
      specs,
      basePrice: 150 + storage * 0.6 + camera * 2 + (specs.has_5g ? 80 : 0),
      tags,
      highlight: camera >= 108 ? "photos are incredibly detailed" : "it feels fast and smooth",
      weakness: battery < 4300 ? "battery life is only average" : "it is a bit bulky",
    };
  },
  headphones: (rng) => {
    const type = rng.pick(["over-ear", "over-ear", "in-ear", "in-ear", "on-ear"]);
    const anc = rng.chance(0.6);
    const specs = {
      type,
      noise_cancelling: anc,
      wireless: rng.chance(0.9),
      battery_hours: type === "in-ear" ? rng.int(6, 10) : rng.int(20, 60),
      weight_g: type === "in-ear" ? rng.int(4, 8) : rng.int(180, 320),
      bluetooth_version: rng.pick(["5.0", "5.2", "5.3", "5.4"]),
    };
    const tags = [];
    if (anc) tags.push("noise cancelling");
    if (type === "in-ear") tags.push("sport");
    if (!anc && specs.weight_g < 200) tags.push("budget");
    return {
      specs,
      basePrice: 30 + (anc ? 150 : 0) + (type === "over-ear" ? 60 : 0) + specs.battery_hours * 1.5,
      tags,
      highlight: anc ? "noise cancelling works great on the train" : "the sound is clear and balanced",
      weakness: type === "over-ear" ? "they get warm after a few hours" : "the case feels a bit cheap",
    };
  },
  tv: (rng) => {
    const screen = rng.pick([43, 50, 55, 55, 65, 65, 75, 85]);
    const panel = rng.pick(["LED", "QLED", "QLED", "OLED"]);
    const specs = {
      screen_inches: screen,
      panel,
      resolution: screen >= 75 && rng.chance(0.3) ? "8K" : screen <= 43 && rng.chance(0.5) ? "Full HD" : "4K",
      refresh_hz: rng.pick([60, 60, 120, 144]),
      hdr: rng.chance(0.8),
      smart_os: rng.pick(["VistaOS", "OrbitOS TV", "Android TV"]),
    };
    const tags = [];
    if (specs.refresh_hz >= 120) tags.push("gaming");
    if (panel === "OLED") tags.push("cinema");
    if (screen <= 50) tags.push("small room");
    return {
      specs,
      basePrice:
        screen * 12 +
        (panel === "OLED" ? 700 : panel === "QLED" ? 250 : 0) +
        (specs.resolution === "8K" ? 900 : 0) +
        (specs.refresh_hz >= 120 ? 150 : 0),
      tags,
      highlight: panel === "OLED" ? "the blacks are perfect for movies" : "colors are vivid and bright",
      weakness: "the built-in sound needs a soundbar",
    };
  },
  tablet: (rng) => {
    const screen = rng.pick([8.3, 10.9, 11, 12.4, 13]);
    const storage = rng.pick([64, 128, 256, 512]);
    const specs = {
      screen_inches: screen,
      storage_gb: storage,
      ram_gb: rng.pick([4, 6, 8, 12]),
      battery_hours: rng.int(8, 15),
      stylus_support: rng.chance(0.6),
      cellular: rng.chance(0.3),
      os: rng.pick(["Android", "OrbitOS"]),
    };
    const tags = [];
    if (specs.stylus_support) tags.push("drawing");
    if (screen <= 8.5) tags.push("compact");
    if (storage <= 64) tags.push("budget");
    return {
      specs,
      basePrice: 120 + storage * 0.8 + screen * 25 + (specs.cellular ? 120 : 0) + (specs.stylus_support ? 60 : 0),
      tags,
      highlight: specs.stylus_support ? "taking notes with the stylus feels natural" : "great for watching videos",
      weakness: "charging is slow",
    };
  },
  smartwatch: (rng) => {
    const gps = rng.chance(0.7);
    const specs = {
      case_mm: rng.pick([41, 42, 44, 46]),
      battery_days: rng.pick([1, 2, 5, 7, 10, 14]),
      gps,
      water_resistance_atm: rng.pick([3, 5, 5, 10]),
      heart_rate: true,
      ecg: rng.chance(0.4),
    };
    const tags = [];
    if (gps) tags.push("running");
    if (specs.battery_days >= 7) tags.push("long battery");
    if (specs.water_resistance_atm >= 5) tags.push("swimming");
    return {
      specs,
      basePrice: 80 + (gps ? 90 : 0) + (specs.ecg ? 80 : 0) + specs.water_resistance_atm * 8,
      tags,
      highlight: gps ? "GPS tracking on runs is accurate" : "it is light and comfortable",
      weakness: specs.battery_days <= 2 ? "it needs charging almost every day" : "the strap is not great",
    };
  },
  camera: (rng) => {
    const type = rng.pick(["mirrorless", "mirrorless", "compact", "action"]);
    const sensor =
      type === "mirrorless" ? rng.pick(["full-frame", "APS-C", "APS-C"]) : type === "compact" ? "1-inch" : "1/2.3-inch";
    const specs = {
      type,
      sensor,
      megapixels: type === "action" ? rng.pick([12, 23, 27]) : rng.pick([20, 24, 26, 33, 45, 61]),
      video: rng.pick(["4K", "4K", "6K", "8K"]),
      stabilization: rng.chance(0.7),
      weight_g: type === "action" ? rng.int(120, 160) : type === "compact" ? rng.int(250, 350) : rng.int(450, 750),
    };
    const tags = [];
    if (type === "action") tags.push("sport", "travel");
    if (sensor === "full-frame") tags.push("professional");
    if (type === "compact") tags.push("travel");
    return {
      specs,
      basePrice:
        (type === "mirrorless" ? 700 : type === "compact" ? 450 : 250) +
        (sensor === "full-frame" ? 1100 : 0) +
        specs.megapixels * 6 +
        (specs.video === "8K" ? 500 : 0),
      tags,
      highlight: specs.stabilization ? "stabilization makes handheld video smooth" : "the image quality is excellent",
      weakness: "the menus are confusing at first",
    };
  },
  speaker: (rng) => {
    const type = rng.pick(["portable", "portable", "smart", "soundbar"]);
    const specs: Record<string, SpecValue> = {
      type,
      power_w: type === "soundbar" ? rng.int(100, 500) : type === "smart" ? rng.int(20, 80) : rng.int(5, 60),
      voice_assistant: type === "smart" || rng.chance(0.2),
      waterproof: type === "portable" ? rng.pick(["IPX7", "IPX7", "IP67", "none"]) : "none",
    };
    if (type === "portable") specs.battery_hours = rng.int(8, 30);
    const tags: string[] = [];
    if (type === "portable") tags.push("outdoor");
    if (type === "soundbar") tags.push("home cinema");
    if (specs.voice_assistant) tags.push("smart home");
    return {
      specs,
      basePrice: 25 + (specs.power_w as number) * 1.4 + (type === "soundbar" ? 120 : 0) + (type === "smart" ? 50 : 0),
      tags,
      highlight: type === "soundbar" ? "dialogue is much clearer" : "it sounds big for its size",
      weakness: "the bass is a bit light",
    };
  },
};

const NAMES = ["Alex", "Sam", "Jordan", "Camille", "Noa", "Robin", "Charlie", "Lou", "Maxime", "Eden", "Sacha", "Kim"];

function makeReviews(rng: Rng, rating: number, draft: Draft): Review[] {
  const count = rng.int(2, 4);
  const reviews: Review[] = [];
  for (let i = 0; i < count; i++) {
    // Each review rating is close to the product average.
    const r = Math.min(5, Math.max(1, Math.round(rating + (rng.next() - 0.5) * 2)));
    const positive = r >= 4;
    reviews.push({
      author: `${rng.pick(NAMES)} ${String.fromCharCode(65 + rng.int(0, 25))}.`,
      rating: r,
      title: positive ? rng.pick(["Very happy", "Great value", "Does the job", "Recommended"]) : rng.pick(["Mixed feelings", "Not convinced", "Could be better"]),
      body: positive
        ? rng.pick([
            `Overall ${draft.highlight}. Only downside: ${draft.weakness}.`,
            `Using it daily for a month: ${draft.highlight}.`,
            `Good purchase, ${draft.highlight}. I would buy it again.`,
          ])
        : rng.pick([
            `Honestly ${draft.weakness}, even if ${draft.highlight}.`,
            `Expected more for the price: ${draft.weakness}.`,
          ]),
    });
  }
  return reviews;
}

function describe(category: Category, brand: string, draft: Draft): string {
  const label: Record<Category, string> = {
    laptop: "laptop",
    smartphone: "smartphone",
    headphones: "headphones",
    tv: "TV",
    tablet: "tablet",
    smartwatch: "smartwatch",
    camera: "camera",
    speaker: "speaker",
  };
  const tagText = draft.tags.length ? ` Ideal for: ${draft.tags.join(", ")}.` : "";
  return `${brand} ${label[category]}. Customers say ${draft.highlight}.${tagText}`;
}

export function generateCatalog(seed = 42, perCategory = 25): Product[] {
  const rng = createRng(seed);
  const products: Product[] = [];
  const usedNames = new Set<string>();

  for (const category of CATEGORIES) {
    for (let i = 0; i < perCategory; i++) {
      const draft = DRAFTERS[category](rng);
      const brand = rng.pick(BRANDS[category]);

      // Model names like "Lumio Aero 14 Pro"; retry suffixes to keep names unique.
      let name = "";
      for (const suffix of ["", " Pro", " Max", " Plus", " SE", " Ultra", " Mini", " X"]) {
        const candidate = `${brand} ${rng.pick(LINES[category])} ${rng.int(2, 9)}${rng.int(0, 9)}${suffix}`;
        if (!usedNames.has(candidate)) {
          name = candidate;
          break;
        }
      }
      if (!name) name = `${brand} ${category} ${products.length + 1}`;
      usedNames.add(name);

      // Price = spec-driven base * brand/market noise (±15%).
      const price = retailPrice(draft.basePrice * (0.85 + rng.next() * 0.3));
      const rating = round1(Math.min(5, 3 + rng.next() * 2));

      products.push({
        id: `P${String(products.length + 1).padStart(4, "0")}`,
        name,
        brand,
        category,
        price,
        rating,
        reviewCount: rng.int(3, 850),
        stock: rng.chance(0.1) ? 0 : rng.int(1, 60),
        description: describe(category, brand, draft),
        tags: draft.tags,
        specs: draft.specs,
        reviews: makeReviews(rng, rating, draft),
      });
    }
  }
  return products;
}
