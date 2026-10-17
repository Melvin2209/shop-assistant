/**
 * One-off script that builds the small word-vector file used for semantic search.
 *
 * Source: the `wink-embeddings-sg-100d` npm package (MIT, derived from Stanford
 * GloVe, PDDL). It is ~300 MB, so it is NOT a dependency: download it once with
 *   npm pack wink-embeddings-sg-100d@1.1.0 && tar xzf wink-embeddings-sg-100d-1.1.0.tgz
 * then run
 *   npx tsx scripts/build-word-vectors.ts package/wink-embeddings-sg-100d.json
 *
 * Output (committed): data/word-vectors.vocab.txt + data/word-vectors.bin.
 * We keep the 50k most frequent words + every word of the catalog, L2-normalize
 * each vector and quantize it to int8 (x127), which shrinks 300 MB to ~5 MB.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { PRODUCTS } from "../src/lib/catalog";
import { productText, tokenize } from "../src/lib/search/text";

const TOP_WORDS = 50_000;

const source = JSON.parse(readFileSync(process.argv[2], "utf8")) as {
  words: string[];
  vectors: Record<string, number[]>;
  dimensions: number;
};

const keep = new Set<string>();
for (const w of source.words) {
  if (keep.size >= TOP_WORDS) break;
  if (/^[a-z][a-z0-9]*$/.test(w)) keep.add(w);
}
for (const p of PRODUCTS) for (const t of tokenize(productText(p))) if (source.vectors[t]) keep.add(t);

const vocab = [...keep].filter((w) => source.vectors[w]);
const dims = source.dimensions;
const out = new Int8Array(vocab.length * dims);
vocab.forEach((word, row) => {
  const v = source.vectors[word].slice(0, dims);
  const norm = Math.hypot(...v) || 1;
  v.forEach((x, i) => (out[row * dims + i] = Math.round((x / norm) * 127)));
});

writeFileSync("data/word-vectors.vocab.txt", vocab.join("\n"));
writeFileSync("data/word-vectors.bin", Buffer.from(out.buffer));
console.log(`Wrote ${vocab.length} words x ${dims} dims`);
