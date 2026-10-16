import { finding, positionAt, runGate, type Finding } from "./lib/gate.js";
import { listRepoFiles } from "./lib/repo-files.js";

export const ATHLETE_ID_PATTERN = /\bi\d{8,9}\b/g;
export const SYNTHETIC_ATHLETE_IDS: ReadonlySet<string> = new Set(["i12345678", "i12345679"]);
export const SELF_PATHS: readonly string[] = [
  "tools/check-fixture-privacy.ts",
  "tools/tests/check-fixture-privacy.test.ts",
];

export function findPrivateIds(path: string, text: string): readonly Finding[] {
  return [...text.matchAll(ATHLETE_ID_PATTERN)]
    .filter((match) => !SYNTHETIC_ATHLETE_IDS.has(match[0]))
    .map((match) => {
      const { line, column } = positionAt(text, match.index);
      return finding(
        path,
        "athlete-id",
        `${match[0]} looks like a real intervals.icu athlete id: use ${[...SYNTHETIC_ATHLETE_IDS].join(" or ")}`,
        line,
        column,
      );
    });
}

runGate(import.meta.url, "check-fixture-privacy", async () =>
  listRepoFiles(process.cwd(), {
    kinds: ["typescript", "markdown", "json"],
    under: [],
    except: SELF_PATHS,
  }).flatMap((file) => findPrivateIds(file.path, file.text)),
);
