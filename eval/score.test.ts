import { describe, expect, it } from "vitest";
import type { AgentRunResult } from "@/lib/agent/types";
import { scoreCase, summarize, type EvalCase } from "./score";

const run = (overrides: Partial<AgentRunResult>): AgentRunResult => ({
  text: "",
  toolCalls: [],
  grounding: { grounded: true, citedIds: [], unknownIds: [], ungroundedPrices: [], ungroundedSpecs: [] },
  ...overrides,
});

const laptopCase: EvalCase = {
  id: "x",
  type: "search",
  question: "laptop under 800",
  expect: { tools: ["search_products"], minCited: 1, citedMatch: { category: "laptop", maxPrice: 800 } },
};

describe("scoreCase", () => {
  it("passes when every expectation holds", () => {
    const score = scoreCase(
      laptopCase,
      run({
        toolCalls: [{ id: "1", name: "search_products", input: {}, result: { ok: true, data: {} } }],
        grounding: { grounded: true, citedIds: ["P0009"], unknownIds: [], ungroundedPrices: [], ungroundedSpecs: [] },
      }),
    );
    expect(score).toMatchObject({ correct: true, hallucination: false, failures: [] });
  });

  it("fails when a cited product breaks the constraints or a tool is missing", () => {
    const score = scoreCase(
      laptopCase,
      run({
        grounding: {
          grounded: false,
          citedIds: ["P0002"],
          unknownIds: [],
          ungroundedPrices: [999],
          ungroundedSpecs: [],
        },
      }),
    );
    expect(score.correct).toBe(false);
    expect(score.hallucination).toBe(true);
    expect(score.failures).toEqual(["expected a search_products call", "cited P0002 does not match the request"]);
  });

  it("checks refusals with regexes", () => {
    const c: EvalCase = {
      id: "o",
      type: "off_topic",
      question: "capital of France?",
      expect: { noTools: true, textMatches: "shopping", textNotMatches: "Paris" },
    };
    expect(scoreCase(c, run({ text: "I can only help with shopping." })).correct).toBe(true);
    expect(scoreCase(c, run({ text: "It's Paris!" })).correct).toBe(false);
  });
});

describe("summarize", () => {
  it("computes accuracy and hallucination rate", () => {
    const s = summarize([
      { id: "a", type: "search", correct: true, hallucination: false, failures: [] },
      { id: "b", type: "search", correct: false, hallucination: true, failures: ["x"] },
    ]);
    expect(s).toMatchObject({ accuracy: 0.5, hallucinationRate: 0.5, byType: { search: { total: 2, correct: 1 } } });
  });
});
