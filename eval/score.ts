import { getProductById } from "@/lib/catalog";
import type { AgentRunResult } from "@/lib/agent/types";
import { matchesFilters, type SearchFilters } from "@/lib/search/search";
import type { CartLine, ToolName } from "@/lib/tools/tools";

/** One test question with the behaviour we expect. All checks are optional and combined with AND. */
export interface EvalCase {
  id: string;
  type: string;
  /** Previous user turns, replayed through the same agent before the question. */
  setup?: string[];
  question: string;
  expect: {
    tools?: ToolName[]; // each must be called during the turn
    noTools?: boolean; // e.g. off-topic: no tool should be needed
    minCited?: number;
    maxCited?: number;
    citedMatch?: SearchFilters; // every cited product must satisfy these constraints
    citesAnyOf?: string[];
    citesAllOf?: string[];
    textMatches?: string; // case-insensitive regex
    textNotMatches?: string;
    cartAdds?: string[]; // exactly these products successfully added to the cart
  };
}

export interface CaseScore {
  id: string;
  type: string;
  correct: boolean;
  hallucination: boolean;
  failures: string[];
}

/**
 * Grades one answer. "Correct" = every expectation holds. "Hallucination" = the
 * grounding check found an id, price or spec figure that no tool returned.
 */
export function scoreCase(c: EvalCase, run: AgentRunResult & { error?: string }): CaseScore {
  const e = c.expect;
  const failures: string[] = [];
  const cited = run.grounding.citedIds;
  const called = new Set(run.toolCalls.map((t) => t.name));

  if (run.error) failures.push(`agent error: ${run.error}`);
  for (const tool of e.tools ?? []) if (!called.has(tool)) failures.push(`expected a ${tool} call`);
  if (e.noTools && called.size > 0) failures.push(`expected no tool call, got ${[...called].join(", ")}`);
  if (e.minCited !== undefined && cited.length < e.minCited)
    failures.push(`expected at least ${e.minCited} cited products, got ${cited.length}`);
  if (e.maxCited !== undefined && cited.length > e.maxCited)
    failures.push(`expected at most ${e.maxCited} cited products, got ${cited.length}`);
  if (e.citedMatch) {
    for (const id of cited) {
      const p = getProductById(id);
      if (!p || !matchesFilters(p, e.citedMatch)) failures.push(`cited ${id} does not match the request`);
    }
  }
  if (e.citesAnyOf && !e.citesAnyOf.some((id) => cited.includes(id)))
    failures.push(`expected one of ${e.citesAnyOf.join(", ")} to be cited`);
  for (const id of e.citesAllOf ?? []) if (!cited.includes(id)) failures.push(`expected ${id} to be cited`);
  if (e.textMatches && !new RegExp(e.textMatches, "i").test(run.text))
    failures.push(`answer should match /${e.textMatches}/`);
  if (e.textNotMatches && new RegExp(e.textNotMatches, "i").test(run.text))
    failures.push(`answer should not match /${e.textNotMatches}/`);
  if (e.cartAdds) {
    const added = run.toolCalls
      .filter((t) => t.name === "add_to_cart" && t.result.ok)
      .map((t) => (t.result.ok ? (t.result.data as CartLine).productId : ""));
    if (added.sort().join() !== [...e.cartAdds].sort().join())
      failures.push(`expected cart adds [${e.cartAdds.join(", ")}], got [${added.join(", ")}]`);
  }

  return { id: c.id, type: c.type, correct: failures.length === 0, hallucination: !run.grounding.grounded, failures };
}

export interface Summary {
  total: number;
  correct: number;
  hallucinations: number;
  accuracy: number; // 0..1
  hallucinationRate: number; // 0..1
  byType: Record<string, { total: number; correct: number }>;
}

export function summarize(scores: CaseScore[]): Summary {
  const byType: Summary["byType"] = {};
  for (const s of scores) {
    byType[s.type] ??= { total: 0, correct: 0 };
    byType[s.type].total++;
    if (s.correct) byType[s.type].correct++;
  }
  const correct = scores.filter((s) => s.correct).length;
  const hallucinations = scores.filter((s) => s.hallucination).length;
  return {
    total: scores.length,
    correct,
    hallucinations,
    accuracy: correct / scores.length,
    hallucinationRate: hallucinations / scores.length,
    byType,
  };
}
