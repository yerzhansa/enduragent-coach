import {
  McpServer,
  type CallToolResult,
  type StandardSchemaWithJSON,
} from "@modelcontextprotocol/server";
import type { z } from "zod";
import { GET_WORKOUT } from "./read-workout.js";
import type { CoachDeps, CoachTool, RenderedReply } from "./tool-contract.js";
import { SPORTS, WORKOUT_KINDS } from "./workout-kinds.js";

export const TOOLS: readonly CoachTool[] = [...WORKOUT_KINDS, GET_WORKOUT];

export type ToolName = (typeof WORKOUT_KINDS)[number]["name"] | typeof GET_WORKOUT.name;

export const TOOL_NAMES: readonly ToolName[] = [
  ...WORKOUT_KINDS.map((kind) => kind.name),
  GET_WORKOUT.name,
];

export const SERVER_INSTRUCTIONS = `Plans workouts for these sports only: ${SPORTS.join(", ")}. For any other sport, say this plugin cannot create it.`;

export interface PluginIdentity {
  readonly name: string;
  readonly version: string;
}

export interface CoachServerOptions extends CoachDeps {
  readonly identity: PluginIdentity;
}

export function createCoachServer(options: CoachServerOptions): McpServer {
  const server = new McpServer(
    { name: options.identity.name, version: options.identity.version },
    { instructions: SERVER_INSTRUCTIONS },
  );
  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: checkedByTheTool(tool.inputSchema),
        annotations: {
          readOnlyHint: tool.readOnly,
          destructiveHint: false,
          idempotentHint: tool.readOnly,
          openWorldHint: true,
        },
      },
      async (args) => toCallToolResult(await tool.run(args, options)),
    );
  }
  return server;
}

function checkedByTheTool(schema: z.ZodType): StandardSchemaWithJSON {
  return { "~standard": { ...schema["~standard"], validate: (value) => ({ value }) } };
}

function toCallToolResult(reply: RenderedReply): CallToolResult {
  return {
    content: [{ type: "text", text: reply.text }],
    ...(reply.isError ? { isError: true } : {}),
  };
}
