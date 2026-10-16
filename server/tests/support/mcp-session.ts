import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { onTestFinished } from "vitest";
import { z } from "zod";
import type { IntervalsPort } from "../../src/calendar.js";
import { createCoachServer, type ToolName } from "../../src/coach-server.js";
import { PINNED_NOW } from "./valid-args.js";

export interface ToolCall {
  readonly isError: boolean;
  readonly reply: Readonly<Record<string, unknown>>;
}

export interface ListedTool {
  readonly name: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
}

export interface McpSession {
  readonly instructions: string | undefined;
  listTools(): Promise<readonly ListedTool[]>;
  call(name: ToolName, args: Record<string, unknown>): Promise<ToolCall>;
}

export interface SessionOptions {
  readonly intervals: IntervalsPort | undefined;
  readonly now?: Date;
}

const callResultSchema = z.object({
  content: z.tuple([z.object({ type: z.literal("text"), text: z.string() })]),
  isError: z.boolean().optional(),
});

const replySchema = z.record(z.string(), z.unknown());

export const TEST_IDENTITY = { name: "enduragent-coach", version: "0.0.0-test" } as const;

export async function openSession(options: SessionOptions): Promise<McpSession> {
  const now = options.now ?? PINNED_NOW;
  const server = createCoachServer({
    identity: TEST_IDENTITY,
    intervals: options.intervals,
    now: () => now,
  });
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "behaviour-test", version: "0.0.0" });
  await client.connect(clientSide);
  onTestFinished(async () => {
    await client.close();
    await server.close();
  });
  return {
    instructions: client.getInstructions(),
    listTools: async () => (await client.listTools()).tools,
    call: async (name, args) => {
      const result = callResultSchema.parse(await client.callTool({ name, arguments: args }));
      const reply = replySchema.parse(JSON.parse(result.content[0].text));
      return { isError: result.isError === true, reply };
    },
  };
}
