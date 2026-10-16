import { describe, expect, it } from "vitest";
import { compareToolNames } from "../smoke.js";
import { finding, formatFindings, positionAt } from "../lib/gate.js";
import { isUnder } from "../lib/repo-files.js";

describe("gate output", () => {
  it("prints findings as file:line:col, rule, message, sorted by file and position", () => {
    expect(
      formatFindings([
        finding("b.ts", "comment", "second", 2, 1),
        finding("a.ts", "comment", "first", 9, 3),
        finding("b.ts", "comment", "early", 1, 5),
      ]),
    ).toBe("a.ts:9:3  comment  first\nb.ts:1:5  comment  early\nb.ts:2:1  comment  second");
  });

  it("maps an offset to a 1-based line and column", () => {
    expect(positionAt("ab\ncd\nef", 4)).toEqual({ line: 2, column: 2 });
  });

  it("matches paths under a directory without matching a sibling prefix", () => {
    expect(isUnder("skills/a/SKILL.md", ["skills"])).toBe(true);
    expect(isUnder("skills-old/a.md", ["skills"])).toBe(false);
    expect(isUnder("README.md", ["README.md"])).toBe(true);
  });
});

describe("compareToolNames", () => {
  it("reports each missing and unexpected tool", () => {
    expect(compareToolNames(["a", "b"], ["b", "c"]).map((item) => item.message)).toEqual([
      "tools/list is missing a",
      "tools/list has unexpected c",
    ]);
  });
});
