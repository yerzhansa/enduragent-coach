import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/client/stdio";
import { z } from "zod";
import { TOOL_NAMES } from "../server/src/coach-server.js";
import { BUNDLE_OUTFILE } from "./bundle.js";
import { finding, runGate, type Finding } from "./lib/gate.js";

export const SMOKE_TIMEOUT_MS = 20_000;
export const EXIT_AFTER_STDIN_CLOSE_MS = 2_000;
export const PLACEHOLDER_KEY = "${INTERVALS_API_KEY}";

export function compareToolNames(
  expected: readonly string[],
  listed: readonly string[],
): readonly Finding[] {
  const listedSet = new Set(listed);
  const expectedSet = new Set(expected);
  return [
    ...[...expectedSet]
      .filter((name) => !listedSet.has(name))
      .map((name) => finding(BUNDLE_OUTFILE, "smoke", `tools/list is missing ${name}`)),
    ...[...listedSet]
      .filter((name) => !expectedSet.has(name))
      .map((name) => finding(BUNDLE_OUTFILE, "smoke", `tools/list has unexpected ${name}`)),
  ];
}

const identitySchema = z.looseObject({ name: z.string(), version: z.string() });
const callResultSchema = z.object({
  content: z.tuple([z.object({ type: z.literal("text"), text: z.string() })]),
});
const replySchema = z.looseObject({ status: z.string(), code: z.string().optional() });

function environment(apiKey: string | undefined): Record<string, string> {
  const env = { ...getDefaultEnvironment() };
  delete env["INTERVALS_API_KEY"];
  return apiKey === undefined ? env : { ...env, INTERVALS_API_KEY: apiKey };
}

async function withClient<T>(
  apiKey: string | undefined,
  use: (client: Client) => Promise<T>,
): Promise<T> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [BUNDLE_OUTFILE],
    env: environment(apiKey),
    stderr: "pipe",
  });
  const client = new Client({ name: "enduragent-coach-smoke", version: "0.0.0" });
  await client.connect(transport);
  try {
    return await use(client);
  } finally {
    await client.close();
  }
}

async function listAndIdentify(): Promise<readonly Finding[]> {
  const pkg = identitySchema.parse(JSON.parse(readFileSync("package.json", "utf8")));
  return withClient(undefined, async (client) => {
    const server = client.getServerVersion();
    const identity =
      server?.name === pkg.name && server.version === pkg.version
        ? []
        : [
            finding(
              BUNDLE_OUTFILE,
              "smoke",
              `serverInfo ${server?.name}@${server?.version} must be ${pkg.name}@${pkg.version}`,
            ),
          ];
    const listed = (await client.listTools()).tools.map((tool) => tool.name);
    return [...identity, ...compareToolNames(TOOL_NAMES, listed)];
  });
}

async function placeholderKeyIsNotConfigured(): Promise<readonly Finding[]> {
  return withClient(PLACEHOLDER_KEY, async (client) => {
    const result = callResultSchema.parse(
      await client.callTool({ name: "get_workout", arguments: { eventId: 1 } }),
    );
    const reply = replySchema.parse(JSON.parse(result.content[0].text));
    return reply.code === "not_configured"
      ? []
      : [
          finding(
            BUNDLE_OUTFILE,
            "smoke",
            `a literal ${PLACEHOLDER_KEY} key must answer not_configured, got ${reply.status} ${reply.code ?? ""}`,
          ),
        ];
  });
}

const INITIALIZE = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "smoke", version: "0.0.0" },
  },
});

function exitsAfterStdinCloses(): Promise<readonly Finding[]> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BUNDLE_OUTFILE], {
      env: environment(undefined),
      stdio: ["pipe", "pipe", "pipe"],
    });
    let closedAt: number | undefined;
    const giveUp = (message: string): void => {
      child.kill("SIGKILL");
      resolve([finding(BUNDLE_OUTFILE, "smoke", message)]);
    };
    let timer = setTimeout(() => giveUp("server never answered initialize"), SMOKE_TIMEOUT_MS);
    child.stdout.once("data", () => {
      closedAt = performance.now();
      child.stdin.end();
      clearTimeout(timer);
      timer = setTimeout(
        () => giveUp(`server still running ${EXIT_AFTER_STDIN_CLOSE_MS} ms after stdin closed`),
        EXIT_AFTER_STDIN_CLOSE_MS,
      );
    });
    child.once("exit", () => {
      clearTimeout(timer);
      const elapsed =
        closedAt === undefined ? Number.POSITIVE_INFINITY : performance.now() - closedAt;
      resolve(
        elapsed <= EXIT_AFTER_STDIN_CLOSE_MS
          ? []
          : [
              finding(
                BUNDLE_OUTFILE,
                "smoke",
                `server exited ${Math.round(elapsed)} ms after stdin closed, limit ${EXIT_AFTER_STDIN_CLOSE_MS} ms`,
              ),
            ],
      );
    });
    child.stdin.write(`${INITIALIZE}\n`);
  });
}

async function smoke(): Promise<readonly Finding[]> {
  const deadline = new Promise<never>((_resolve, reject) => {
    setTimeout(
      () => reject(new Error(`smoke test exceeded ${SMOKE_TIMEOUT_MS} ms`)),
      SMOKE_TIMEOUT_MS,
    ).unref();
  });
  const checks = Promise.all([
    listAndIdentify(),
    placeholderKeyIsNotConfigured(),
    exitsAfterStdinCloses(),
  ]);
  return (await Promise.race([checks, deadline])).flat();
}

runGate(import.meta.url, "smoke", smoke);
