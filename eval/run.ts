/**
 * Runs the 30-question evaluation and writes eval/results/<mode>.{json,md}.
 *
 *   npm run eval              # mock mode: free, deterministic
 *   npm run eval -- --real    # real LLM: needs ANTHROPIC_API_KEY (a few cents with Haiku)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import type { AgentMode } from "@/lib/agent/types";
import { DEFAULT_MODEL } from "@/lib/agent/real";
import { runEval } from "./runner";

const mode: AgentMode = process.argv.includes("--real") ? "real" : "mock";
const pct = (x: number) => `${Math.round(x * 100)}%`;

async function main() {
  if (mode === "real" && !process.env.ANTHROPIC_API_KEY) {
    console.error("Real mode needs ANTHROPIC_API_KEY (put it in .env.local, then: npm run eval -- --real).");
    process.exit(1);
  }
  const model = mode === "real" ? process.env.ANTHROPIC_MODEL || DEFAULT_MODEL : "scripted mock agent";
  console.log(`Running the eval in ${mode} mode (${model})...\n`);

  const { scores, details, summary, retrieval } = await runEval(mode, (s) =>
    console.log(
      `${s.correct ? "PASS" : "FAIL"}${s.hallucination ? " +HALLUCINATION" : ""}  ${s.id.padEnd(16)} ${s.failures.join("; ")}`,
    ),
  );

  const md = [
    `### Results: ${mode} mode (${model})`,
    "",
    `| Metric | Value |`,
    `|---|---|`,
    `| Correct answers | **${summary.correct}/${summary.total} (${pct(summary.accuracy)})** |`,
    `| Answers with a hallucination | **${summary.hallucinations}/${summary.total} (${pct(summary.hallucinationRate)})** |`,
    "",
    `| Question type | Correct |`,
    `|---|---|`,
    ...Object.entries(summary.byType).map(([t, s]) => `| ${t} | ${s.correct}/${s.total} |`),
    "",
    `Retrieval benchmark (${retrieval[0].n} search questions, raw text only, top 5):`,
    "",
    `| Search mode | Precision@5 | Hit@5 |`,
    `|---|---|---|`,
    ...retrieval.map((r) => `| ${r.mode} | ${pct(r.precisionAt5)} | ${pct(r.hitAt5)} |`),
    "",
    ...(scores.some((s) => !s.correct)
      ? ["Failed cases:", "", ...scores.filter((s) => !s.correct).map((s) => `- \`${s.id}\`: ${s.failures.join("; ")}`)]
      : []),
  ].join("\n");

  mkdirSync("eval/results", { recursive: true });
  const json = { mode, model, date: new Date().toISOString().slice(0, 10), summary, retrieval, cases: details };
  writeFileSync(`eval/results/${mode}.json`, JSON.stringify(json, null, 2) + "\n");
  writeFileSync(`eval/results/${mode}.md`, md + "\n");
  console.log("\n" + md);
}

main();
