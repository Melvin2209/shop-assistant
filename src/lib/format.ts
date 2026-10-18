import type { Category, SpecValue } from "@/lib/catalog";

/** €1,229.99 */
export function formatPrice(price: number): string {
  return `€${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const BOOLEAN_LABELS: Record<string, string> = {
  noise_cancelling: "noise cancelling",
  wireless: "wireless",
  has_5g: "5G",
  hdr: "HDR",
  stylus_support: "stylus support",
  cellular: "cellular",
  gps: "GPS",
  heart_rate: "heart-rate sensor",
  ecg: "ECG",
  stabilization: "stabilization",
  voice_assistant: "voice assistant",
};

const NUMBER_FORMATS: Record<string, (v: number) => string> = {
  ram_gb: (v) => `${v} GB RAM`,
  storage_gb: (v) => (v >= 1024 ? `${v / 1024} TB storage` : `${v} GB storage`),
  screen_inches: (v) => `${v}" screen`,
  battery_hours: (v) => `${v} h battery`,
  battery_mah: (v) => `${v} mAh battery`,
  battery_days: (v) => `${v}-day battery`,
  weight_kg: (v) => `${v} kg`,
  weight_g: (v) => `${v} g`,
  camera_mp: (v) => `${v} MP camera`,
  megapixels: (v) => `${v} MP`,
  refresh_hz: (v) => `${v} Hz`,
  case_mm: (v) => `${v} mm case`,
  water_resistance_atm: (v) => `${v} ATM water resistance`,
  power_w: (v) => `${v} W`,
};

/** Human-readable spec, e.g. ("ram_gb", 16) -> "16 GB RAM", ("gps", false) -> "no GPS". */
export function formatSpec(key: string, value: SpecValue): string {
  if (typeof value === "boolean") {
    const label = BOOLEAN_LABELS[key] ?? key.replace(/_/g, " ");
    return value ? label : `no ${label}`;
  }
  if (typeof value === "number" && NUMBER_FORMATS[key]) return NUMBER_FORMATS[key](value);
  const label = key.replace(/_/g, " ");
  return ["type", "panel", "resolution"].includes(key) ? String(value) : `${label}: ${value}`;
}

/** The specs worth showing in a one-line product summary. */
export const KEY_SPECS: Record<Category, string[]> = {
  laptop: ["ram_gb", "storage_gb", "screen_inches", "battery_hours", "weight_kg"],
  smartphone: ["storage_gb", "camera_mp", "battery_mah", "screen_inches"],
  headphones: ["type", "noise_cancelling", "battery_hours"],
  tv: ["screen_inches", "panel", "resolution", "refresh_hz"],
  tablet: ["screen_inches", "storage_gb", "battery_hours", "stylus_support"],
  smartwatch: ["battery_days", "gps", "water_resistance_atm"],
  camera: ["type", "sensor", "megapixels", "video"],
  speaker: ["type", "power_w", "battery_hours", "waterproof"],
};

export const CATEGORY_LABELS: Record<Category, { one: string; many: string }> = {
  laptop: { one: "laptop", many: "laptops" },
  smartphone: { one: "smartphone", many: "smartphones" },
  headphones: { one: "pair of headphones", many: "headphones" },
  tv: { one: "TV", many: "TVs" },
  tablet: { one: "tablet", many: "tablets" },
  smartwatch: { one: "smartwatch", many: "smartwatches" },
  camera: { one: "camera", many: "cameras" },
  speaker: { one: "speaker", many: "speakers" },
};
