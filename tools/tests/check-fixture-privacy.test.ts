import { describe, expect, it } from "vitest";
import { findPrivateIds } from "../check-fixture-privacy.js";

describe("findPrivateIds", () => {
  it("allows the two synthetic athlete ids", () => {
    expect(findPrivateIds("fixture.json", '{"id":"i12345678","other":"i12345679"}')).toEqual([]);
  });

  it("flags any other athlete-id-shaped token with its line", () => {
    const findings = findPrivateIds("fixture.ts", 'const a = 1;\nconst id = "i87654321";\n');
    expect(findings.map((item) => [item.line, item.column, item.rule])).toEqual([
      [2, 13, "athlete-id"],
    ]);
  });

  it("ignores ids embedded in longer words", () => {
    expect(findPrivateIds("notes.md", "xi123456789 and i1234567890")).toEqual([]);
  });
});
