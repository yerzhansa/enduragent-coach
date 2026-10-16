import { describe, expect, it } from "vitest";
import { findTrademarks } from "../check-trademarks.js";
import type { FileKind } from "../lib/repo-files.js";

const terms = (text: string, kind: FileKind): readonly string[] =>
  findTrademarks("sample", text, kind).map((item) => item.message.split('"')[1] ?? "");

describe("findTrademarks", () => {
  it("finds acronyms and spelled-out names in strings, templates and comments, not identifiers", () => {
    expect(
      terms(
        'const TSS = 1;\nconst a = "your CTL rose";\nconst b = `Training Stress Score ${TSS}`;\n// Intensity Factor\n',
        "typescript",
      ),
    ).toEqual(["CTL", "Training Stress Score", "Intensity Factor"]);
  });

  it("matches phrases across line breaks and respects word boundaries", () => {
    expect(terms("Normalized\nPower is out. NPC and IFS are fine.", "markdown")).toEqual([
      "Normalized Power",
    ]);
  });

  it("ignores fenced code blocks in markdown but reports inline prose with its position", () => {
    const findings = findTrademarks(
      "skill.md",
      "Intro\n\n```\nNP 250\n```\n\nThen ATL drops.\n",
      "markdown",
    );
    expect(findings.map((item) => [item.line, item.column, item.rule])).toEqual([
      [7, 6, "trademark"],
    ]);
  });

  it("matches spelled-out names in any letter case", () => {
    expect(
      terms(
        "Normalized power and normalized power. Training stress score, Intensity factor, chronic training load and NORM POWER.",
        "markdown",
      ),
    ).toEqual([
      "Normalized power",
      "normalized power",
      "Training stress score",
      "Intensity factor",
      "chronic training load",
      "NORM POWER",
    ]);
  });

  it("names the replacement for a spelled-out name in any letter case", () => {
    expect(findTrademarks("sample", "acute training load", "markdown")[0]?.message).toContain(
      '"Fatigue"',
    );
  });

  it("keeps acronyms case-sensitive and whole-word", () => {
    expect(
      terms(
        'const a = "if np rose, ctl and tss stay"; if (a) {}\nIf in doubt, Np is fine.',
        "typescript",
      ),
    ).toEqual([]);
    expect(terms("If IF and NP rise, so does TSS.", "markdown")).toEqual(["IF", "NP", "TSS"]);
  });
});

describe("findTrademarks on the plugin manifest", () => {
  it("reports trademark terms in any string value, not in keys", () => {
    const manifest = JSON.stringify({
      name: "x",
      description: "Tracks your training stress score",
      keywords: ["cycling", "CTL"],
      variables: { properties: { TSS: { title: "Key", description: "Normalized power" } } },
    });
    expect(terms(manifest, "json")).toEqual(["training stress score", "CTL", "Normalized power"]);
  });
});
