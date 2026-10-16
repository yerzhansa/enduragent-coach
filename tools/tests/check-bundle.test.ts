import { describe, expect, it } from "vitest";
import { EXPECTED_PACK_FILES, SHEBANG, checkBundle } from "../check-bundle.js";

const good = `${SHEBANG}\nconsole.log("server");\n`;

describe("checkBundle", () => {
  it("accepts an up-to-date bundle with a shebang and the exact pack list", () => {
    expect(
      checkBundle({
        committed: good,
        rebuilt: good,
        packFiles: EXPECTED_PACK_FILES.toReversed(),
      }),
    ).toEqual([]);
  });

  it("reports a missing, stale, shebang-less or path-leaking bundle", () => {
    const rules = (committed: string | undefined, rebuilt = committed ?? good) =>
      checkBundle({ committed, rebuilt, packFiles: EXPECTED_PACK_FILES }).map((item) => item.rule);
    expect(rules(undefined)).toEqual(["missing"]);
    expect(rules(good, `${good}\n`)).toEqual(["stale"]);
    expect(rules('console.log("server");\n')).toEqual(["shebang"]);
    expect(rules(`${good}const root = "/Users/someone/repo/x";\n`)).toEqual(["absolute-path"]);
  });

  it("reports extra or missing packed files", () => {
    expect(
      checkBundle({
        committed: good,
        rebuilt: good,
        packFiles: ["dist/server.js", "package.json", "server/src/main.ts"],
      }).map((item) => item.rule),
    ).toEqual(["pack"]);
  });
});
