/**
 * Writes the fictional catalog to data/products.json.
 * Usage: npm run catalog:generate
 */
import { writeFileSync } from "node:fs";
import { generateCatalog } from "../src/lib/catalog/generator";

const products = generateCatalog();
writeFileSync("data/products.json", JSON.stringify(products, null, 2) + "\n");
console.log(`Wrote ${products.length} products to data/products.json`);
