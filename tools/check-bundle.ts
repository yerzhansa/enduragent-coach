import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { build } from "esbuild";
import { z } from "zod";
import { BUNDLE_OPTIONS, BUNDLE_OUTFILE } from "./bundle.js";
import { finding, runGate, type Finding } from "./lib/gate.js";

export const EXPECTED_PACK_FILES: readonly string[] = [
  "LICENSE",
  "README.md",
  "dist/server.js",
  "package.json",
];

export const SHEBANG = "#!/usr/bin/env node";

export const ABSOLUTE_PATH_PATTERN =
  /(?:\/Users\/[^/\s"']+\/|\/home\/[^/\s"']+\/|\/private\/tmp\/|\/var\/folders\/|\/tmp\/|[A-Za-z]:\\\\)/;

export interface BundleFacts {
  readonly committed: string | undefined;
  readonly rebuilt: string;
  readonly packFiles: readonly string[];
}

export function checkBundle(facts: BundleFacts): readonly Finding[] {
  const findings: Finding[] = [];
  const report = (rule: string, message: string, file = BUNDLE_OUTFILE): void => {
    findings.push(finding(file, rule, message));
  };
  if (facts.committed === undefined) {
    report("missing", "dist/server.js does not exist: run pnpm bundle and commit it");
  } else {
    if (facts.committed !== facts.rebuilt)
      report("stale", "dist/server.js differs from a fresh build: run pnpm bundle and commit it");
    if (facts.committed.split("\n", 1)[0] !== SHEBANG)
      report("shebang", `line 1 must be ${SHEBANG}`);
    const leak = ABSOLUTE_PATH_PATTERN.exec(facts.committed);
    if (leak !== null) report("absolute-path", `contains the absolute path fragment ${leak[0]}`);
  }
  const packed = facts.packFiles.toSorted();
  if (JSON.stringify(packed) !== JSON.stringify(EXPECTED_PACK_FILES.toSorted())) {
    report(
      "pack",
      `npm pack lists ${JSON.stringify(packed)}, expected ${JSON.stringify(EXPECTED_PACK_FILES)}`,
      "package.json",
    );
  }
  return findings;
}

const packSchema = z.array(z.object({ files: z.array(z.object({ path: z.string() })) })).length(1);

async function gatherFacts(): Promise<BundleFacts> {
  const result = await build({ ...BUNDLE_OPTIONS, write: false });
  const rebuilt = result.outputFiles[0]?.text ?? "";
  const committed = existsSync(BUNDLE_OUTFILE) ? readFileSync(BUNDLE_OUTFILE, "utf8") : undefined;
  const pack = spawnSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    encoding: "utf8",
  });
  if (pack.status !== 0) throw new Error(`npm pack --dry-run failed: ${pack.stderr}`);
  const packFiles = packSchema
    .parse(JSON.parse(pack.stdout))
    .flatMap((entry) => entry.files.map((file) => file.path));
  return { committed, rebuilt, packFiles };
}

runGate(import.meta.url, "check-bundle", async () => checkBundle(await gatherFacts()));
