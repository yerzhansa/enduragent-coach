import { build, type BuildOptions } from "esbuild";
import { isEntry } from "./lib/gate.js";

export const BUNDLE_OUTFILE = "dist/server.js";

export const BUNDLE_OPTIONS = {
  entryPoints: ["server/src/main.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: BUNDLE_OUTFILE,
  banner: { js: "#!/usr/bin/env node" },
  legalComments: "none",
  logLevel: "warning",
} as const satisfies BuildOptions;

if (isEntry(import.meta.url)) await build(BUNDLE_OPTIONS);
