import { describe, expect, it } from "vitest";
import { MAX_FILE_LINES, scanTypeScript } from "../check-code-quality.js";

const rules = (text: string): readonly string[] =>
  scanTypeScript("sample.ts", text).map((item) => item.rule);

describe("scanTypeScript", () => {
  it("flags line, block and doc comments with their position", () => {
    const findings = scanTypeScript(
      "sample.ts",
      "const a = 1;\n// why\n/** doc */\nexport const b = a; /* tail */\n",
    );
    expect(findings.map((item) => [item.rule, item.line, item.column])).toEqual([
      ["comment", 2, 1],
      ["comment", 3, 1],
      ["comment", 4, 21],
    ]);
  });

  it("does not count comment-like text inside strings, templates and regexes", () => {
    expect(
      rules('const a = "// not a comment";\nconst b = `/* nor this */`;\nconst c = /\\/\\//;\n'),
    ).toEqual([]);
  });

  it("reports a lint suppression in addition to the comment", () => {
    expect(rules("// oxlint-disable-next-line no-console\nconst a = 1;\n")).toEqual([
      "comment",
      "lint-suppression",
    ]);
  });

  it("flags double assertions through unknown", () => {
    expect(
      rules("const a = (1 as unknown) as string;\nconst b = 1 as unknown as string;\n"),
    ).toEqual(["double-assertion", "double-assertion"]);
  });

  it("flags rejection handlers that swallow the error", () => {
    expect(
      rules(
        "p.catch(() => {});\np.catch(() => undefined);\np.catch(() => null);\np.catch(() => void 0);\np.catch((e) => report(e));\n",
      ),
    ).toEqual([
      "swallowed-rejection",
      "swallowed-rejection",
      "swallowed-rejection",
      "swallowed-rejection",
    ]);
  });

  it("flags files over the line limit", () => {
    expect(rules("const a = 1;\n".repeat(MAX_FILE_LINES))).toEqual([]);
    expect(rules("const a = 1;\n".repeat(MAX_FILE_LINES + 1))).toEqual(["file-length"]);
  });
});
