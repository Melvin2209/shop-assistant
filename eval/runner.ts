import { readFileSync } from "node:fs";
import path from "node:path";
import { runAgentToCompletion } from "@/lib/agent";
import type { AgentMode, ChatMessage } from "@/lib/agent/types";
import { getProductById } from "@/lib/catalog";
import { getProductSearch, matchesFilters, type SearchMode } from "@/lib/search/search";
import { scoreCase, summarize, type CaseScore, type EvalCase } from "./score";

export function loadCases(): EvalCase[] {
  return JSON.parse(readFileSync(path.join(process.cwd(), "eval/dataset.json"), "utf8")) as EvalCase[];
}

async function runCase(c: EvalCase, mode: AgentMode) {
  const history: ChatMessage[] = [];
  // Setup turns are answered by the same agent, so follow-ups ("compare the first two") are realistic.
  const turns = [...(c.setup ?? []), c.question];
  for (const [i, turn] of turns.entries()) {
    history.push({ role: "user", content: turn });
    const result = await runAgentToCompletion(history, { mode });
    history.push({ role: "assistant", content: result.text });
    if (i === turns.length - 1) return result;
  }
  throw new Error("unreachable");
}

/**
 * Retrieval benchmark: for search questions, how many of the top 5 results of
 * each search mode satisfy the expected constraints, using the raw question
 * only (no filters extracted). Isolates the quality of the search engine itself.
 */
export function retrievalBenchmark(cases: EvalCase[]) {
  const searchCases = cases.filter((c) => ["search", "semantic"].includes(c.type) && c.expect.citedMatch);
  const modes: SearchMode[] = ["keyword", "semantic", "hybrid"];
  return modes.map((m) => {
    let precision = 0;
    let hits = 0;
    for (const c of searchCases) {
      const top = getProductSearch().search({ query: c.question, mode: m, limit: 5 });
      const relevant = top.filter((h) => matchesFilters(getProductById(h.product.id)!, c.expect.citedMatch)).length;
      precision += top.length ? relevant / top.length : 0;
      if (relevant > 0) hits++;
    }
    return {
      mode: m,
      precisionAt5: precision / searchCases.length,
      hitAt5: hits / searchCases.length,
      n: searchCases.length,
    };
  });
}

export async function runEval(mode: AgentMode, onCase?: (score: CaseScore) => void) {
  const cases = loadCases();
  const scores: CaseScore[] = [];
  const details = [];
  for (const c of cases) {
    const result = await runCase(c, mode);
    const score = scoreCase(c, result);
    scores.push(score);
    onCase?.(score);
    details.push({
      ...score,
      question: c.question,
      answer: result.text,
      tools: result.toolCalls.map((t) => t.name),
      grounding: result.grounding,
    });
  }
  return { scores, details, summary: summarize(scores), retrieval: retrievalBenchmark(cases) };
}
