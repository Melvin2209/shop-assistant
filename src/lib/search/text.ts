import type { Category, Product } from "@/lib/catalog";

// Very common words that carry no meaning for product search.
const STOPWORDS = new Set(
  "a an the and or of for to in on with without is are be i me my we you it this that what which who want need looking some any can could would should please show find give get best good under over less than more about than up from by at as".split(
    " ",
  ),
);

/** Lowercase, strip accents, split on anything that is not a letter or digit. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9.]+/)
    .map((t) => t.replace(/^\.+|\.+$/g, "")) // keep "6.7" but not trailing dots
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/** Words shoppers use for each category ("phone" for a smartphone, "earbuds"...). */
export const CATEGORY_ALIASES: Record<Category, string> = {
  laptop: "laptop notebook computer pc",
  smartphone: "smartphone phone mobile cellphone",
  headphones: "headphones headset earbuds earphones",
  tv: "tv television screen",
  tablet: "tablet",
  smartwatch: "smartwatch watch fitness tracker",
  camera: "camera",
  speaker: "speaker audio",
};

/**
 * Text used by semantic search: meaning-bearing words only. Text specs ("OLED",
 * "full-frame") and true boolean specs ("noise cancelling") are kept; numbers
 * are dropped because word vectors don't understand quantities.
 */
export function productSemanticText(p: Product): string {
  const specWords = Object.entries(p.specs).map(([key, value]) =>
    typeof value === "string" && !/\d/.test(value) ? value : value === true ? key.replace(/_/g, " ") : "",
  );
  return [CATEGORY_ALIASES[p.category], p.tags.join(" "), p.description, ...specWords].join(" ");
}

/** Text used by keyword search: everything, including spec names and values. */
export function productText(p: Product): string {
  const specs = Object.entries(p.specs)
    .map(([key, value]) => {
      const k = key.replace(/_/g, " ");
      // "noise cancelling: true" reads better as just "noise cancelling".
      if (value === true) return k;
      if (value === false) return "";
      return `${k} ${value}`;
    })
    .join(" ");
  return [p.name, p.brand, CATEGORY_ALIASES[p.category], p.tags.join(" "), p.description, specs].join(" ");
}
