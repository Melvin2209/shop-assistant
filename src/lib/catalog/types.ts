export const CATEGORIES = [
  "laptop",
  "smartphone",
  "headphones",
  "tv",
  "tablet",
  "smartwatch",
  "camera",
  "speaker",
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Spec values are kept flat and primitive so they are easy to filter and compare. */
export type SpecValue = string | number | boolean;

export interface Review {
  author: string;
  rating: number; // 1..5
  title: string;
  body: string;
}

export interface Product {
  id: string; // e.g. "P0042"
  name: string;
  brand: string;
  category: Category;
  price: number; // EUR, tax included
  rating: number; // average rating, 1 decimal
  reviewCount: number;
  stock: number; // 0 = out of stock
  description: string;
  tags: string[];
  specs: Record<string, SpecValue>;
  reviews: Review[];
}
