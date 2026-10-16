import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import { connectIntervals, readApiKey } from "./calendar.js";
import { createCoachServer, type PluginIdentity } from "./coach-server.js";

const UNKNOWN_IDENTITY: PluginIdentity = { name: "enduragent-coach", version: "0.0.0" };

const identitySchema = z.object({ name: z.string().min(1), version: z.string().min(1) });

function findPackageJson(entryUrl: string): string | undefined {
  let directory = dirname(fileURLToPath(entryUrl));
  for (;;) {
    const candidate = join(directory, "package.json");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}

function readPluginIdentity(entryUrl: string): PluginIdentity {
  const path = findPackageJson(entryUrl);
  if (path === undefined) return UNKNOWN_IDENTITY;
  try {
    const parsed = identitySchema.safeParse(JSON.parse(readFileSync(path, "utf8")));
    return parsed.success ? parsed.data : UNKNOWN_IDENTITY;
  } catch {
    return UNKNOWN_IDENTITY;
  }
}

function log(identity: PluginIdentity, message: string): void {
  process.stderr.write(`${identity.name}: ${message}\n`);
}

function main(): void {
  const apiKey = readApiKey(process.env["INTERVALS_API_KEY"]);
  const identity = readPluginIdentity(import.meta.url);
  const options = {
    identity,
    intervals: apiKey === undefined ? undefined : connectIntervals({ apiKey }),
    now: () => new Date(),
  };
  const handle = serveStdio(() => createCoachServer(options), {
    onerror: (error) => log(identity, error.message),
  });
  log(identity, `${identity.version} ready, API key ${apiKey === undefined ? "missing" : "set"}`);
  const stop = (): void => {
    void handle.close().finally(() => process.exit(0));
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
}

main();
