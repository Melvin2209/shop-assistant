import { describe, expect, it } from "vitest";
import { runEval } from "./runner";

// Runs the full 30-question eval against the mock agent on every CI run.
// It is free and deterministic, so it works as an end-to-end regression test.
describe("eval (mock mode)", () => {
  it("keeps accuracy high and hallucinations at zero", async () => {
    const { summary } = await runEval("mock");
    expect(summary.total).toBe(30);
    expect(summary.hallucinations).toBe(0);
    expect(summary.accuracy).toBeGreaterThanOrEqual(0.9);
  });
});
