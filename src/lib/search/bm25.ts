/**
 * BM25 keyword ranking, the classic formula used by search engines.
 * score(doc, query) = sum over query terms t of
 *   idf(t) * tf * (k1 + 1) / (tf + k1 * (1 - b + b * docLength / avgDocLength))
 * - tf: how often t appears in the doc (with diminishing returns via k1)
 * - idf: rare terms weigh more than common ones
 * - b: normalizes long documents so they don't win just by being long
 */
export class Bm25Index {
  private readonly termFreqs: Map<string, number>[] = [];
  private readonly docLengths: number[] = [];
  private readonly docFreq = new Map<string, number>();
  private readonly avgLength: number;

  constructor(
    private readonly ids: string[],
    docs: string[][],
    private readonly k1 = 1.2,
    private readonly b = 0.75,
  ) {
    for (const tokens of docs) {
      const tf = new Map<string, number>();
      for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
      this.termFreqs.push(tf);
      this.docLengths.push(tokens.length);
      for (const t of tf.keys()) this.docFreq.set(t, (this.docFreq.get(t) ?? 0) + 1);
    }
    this.avgLength = this.docLengths.reduce((a, b) => a + b, 0) / Math.max(1, docs.length);
  }

  idf(term: string): number {
    const n = this.ids.length;
    const df = this.docFreq.get(term) ?? 0;
    return Math.log(1 + (n - df + 0.5) / (df + 0.5));
  }

  /** Returns a score per doc id, only for docs matching at least one term. */
  search(queryTokens: string[]): Map<string, number> {
    const scores = new Map<string, number>();
    this.termFreqs.forEach((tf, i) => {
      let score = 0;
      for (const term of new Set(queryTokens)) {
        const f = tf.get(term);
        if (!f) continue;
        const norm = 1 - this.b + (this.b * this.docLengths[i]) / this.avgLength;
        score += (this.idf(term) * f * (this.k1 + 1)) / (f + this.k1 * norm);
      }
      if (score > 0) scores.set(this.ids[i], score);
    });
    return scores;
  }
}
