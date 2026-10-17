import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Text embeddings built from static word vectors (GloVe, 100 dimensions).
 *
 * A text vector is the weighted average of its word vectors, where rare words
 * weigh more (IDF). It is far simpler than a transformer model but runs in pure
 * TypeScript, in microseconds, with no API key and no native dependency, and it
 * still captures meaning: "quiet" lands close to "noise", "movies" to "cinema".
 * The Embedder interface lets us swap in an embeddings API later.
 */
export interface Embedder {
  /** Returns an L2-normalized vector, or null if no word of the text is known. */
  embed(text: string[]): Float32Array | null;
}

export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // both vectors are normalized, so the dot product is the cosine
}

function normalize(v: Float32Array): Float32Array {
  const norm = Math.hypot(...v);
  if (norm > 0) for (let i = 0; i < v.length; i++) v[i] /= norm;
  return v;
}

export class WordVectorEmbedder implements Embedder {
  private readonly index = new Map<string, number>();
  private readonly vectors: Int8Array;
  readonly dims: number;

  constructor(
    vocab: string[],
    vectors: Int8Array,
    /** Weight of each word; unknown words default to the highest weight. */
    private readonly weight: (word: string) => number = () => 1,
  ) {
    vocab.forEach((w, i) => this.index.set(w, i));
    this.vectors = vectors;
    this.dims = vectors.length / vocab.length;
  }

  /** Loads data/word-vectors.* (built by scripts/build-word-vectors.ts). */
  static fromDataDir(weight?: (word: string) => number, dir = path.join(process.cwd(), "data")) {
    const vocab = readFileSync(path.join(dir, "word-vectors.vocab.txt"), "utf8").split("\n");
    const buffer = readFileSync(path.join(dir, "word-vectors.bin"));
    const vectors = new Int8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    return new WordVectorEmbedder(vocab, vectors, weight);
  }

  has(word: string): boolean {
    return this.index.has(word);
  }

  embed(tokens: string[]): Float32Array | null {
    const sum = new Float32Array(this.dims);
    let found = false;
    for (const token of tokens) {
      const row = this.index.get(token);
      if (row === undefined) continue;
      found = true;
      const w = this.weight(token);
      // Vectors are stored as int8 (value * 127); the scale cancels out after normalizing.
      for (let i = 0; i < this.dims; i++) sum[i] += w * this.vectors[row * this.dims + i];
    }
    return found ? normalize(sum) : null;
  }
}
