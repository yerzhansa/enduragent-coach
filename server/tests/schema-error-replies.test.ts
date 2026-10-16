import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";
import { describe, expect, it } from "vitest";
import { TOOLS } from "../src/coach-server.js";
import { fakeIntervals } from "./support/fake-intervals.js";
import { TEST_IDENTITY, openSession } from "./support/mcp-session.js";
import { VALID_CREATE_ARGS } from "./support/valid-args.js";

const LATER = "2026-10-21";

const INVALID_INPUT_NEXT =
  "The arguments do not match the tool's input schema. Fix what details lists and call again.";

function skill(name: string): string {
  return readFileSync(new URL(`../../skills/${name}/SKILL.md`, import.meta.url), "utf8");
}

const WORKOUTS_SKILL = skill("intervals-icu-workouts");

const CREATE_STEP = WORKOUTS_SKILL.split("### 2. Create")[1]?.split("### 3.")[0];

const cyclingArgs = VALID_CREATE_ARGS.cycling(LATER);

const steady = {
  type: "steady",
  duration: { value: 5, unit: "minutes" },
  power: { kind: "percent_ftp", value: 70 },
} as const;

describe("a create call whose arguments break the input schema", () => {
  it.each([
    [
      "create_cycling_workout",
      "a date not written YYYY-MM-DD",
      ["date"],
      { ...cyclingArgs, date: "21/10/2026" },
    ],
    [
      "create_cycling_workout",
      "a duration unit a simple step does not take",
      ["steps[0].duration.unit", "minutes"],
      { ...cyclingArgs, steps: [{ ...steady, duration: { value: 2, unit: "hours" } }] },
    ],
    [
      "create_cycling_workout",
      "a power kind the interval of a set does not take",
      ["steps[1].interval.power.kind", "percent_ftp"],
      {
        ...cyclingArgs,
        steps: [
          steady,
          {
            type: "set",
            repeat: 3,
            interval: { ...steady, power: { kind: "ftp", value: 90 } },
            recovery: steady,
          },
        ],
      },
    ],
    [
      "create_cycling_workout",
      "a step type that does not exist",
      ["steps[2].type", "freeride"],
      { ...cyclingArgs, steps: [steady, steady, { ...steady, type: "sprint" }] },
    ],
    [
      "create_strength_workout",
      "an unknown key",
      ["notes"],
      { ...VALID_CREATE_ARGS.strength(LATER), notes: "bring chalk" },
    ],
    [
      "create_strength_workout",
      "a fractional duration",
      ["durationMinutes"],
      { ...VALID_CREATE_ARGS.strength(LATER), durationMinutes: 1.5 },
    ],
    [
      "create_strength_workout",
      "a session description that is not text",
      ["description", "string"],
      { ...VALID_CREATE_ARGS.strength(LATER), description: ["Back squat 4x6"] },
    ],
  ] as const)(
    "%s answers %s with a JSON invalid_input refusal naming %j, without any request",
    async (tool, _label, fragments, args) => {
      const intervals = fakeIntervals();
      const { isError, reply } = await (await openSession({ intervals })).call(tool, args);
      expect(isError).toBe(true);
      expect(reply).toMatchObject({
        status: "refused",
        saved: "no",
        code: "invalid_input",
        next: INVALID_INPUT_NEXT,
      });
      for (const fragment of fragments) expect(reply["details"]).toContain(fragment);
      expect(intervals.requests).toEqual([]);
    },
  );

  it("is covered by the skills' promise that every create reply is JSON", () => {
    expect(CREATE_STEP).toMatch(/Every reply is JSON with `status`, `saved` and `next`/);
    for (const name of ["intervals-icu-workouts", "strength-workouts"]) {
      expect(skill(name)).not.toMatch(/plain-text/);
    }
  });
});

function refusalTable(text: string): Map<string, string> {
  const rows = text
    .split("\n")
    .filter((line) => line.startsWith("| `"))
    .map((line) => line.split("|").map((cell) => cell.trim()));
  return new Map(rows.map(([, code = "", todo = ""]) => [code, todo]));
}

describe("the skills' refusal tables", () => {
  const workouts = refusalTable(WORKOUTS_SKILL);
  const strength = refusalTable(skill("strength-workouts"));

  it("tell the agent what to do with invalid_input", () => {
    expect(workouts.get("`invalid_input`")).toMatch(/details/);
    expect(strength.get("`invalid_input`")).toMatch(/details/);
  });

  it("give strength the same advice as cycling for each shared code", () => {
    expect(Object.fromEntries(strength)).toEqual(
      Object.fromEntries([...strength.keys()].map((code) => [code, workouts.get(code)])),
    );
  });
});

describe("a get_workout call whose arguments break the input schema", () => {
  it.each([
    ["a string eventId", "123"],
    ["a non-positive eventId", 0],
  ] as const)(
    "answers %s with a JSON invalid_input refusal naming eventId, without any request",
    async (_label, eventId) => {
      const intervals = fakeIntervals();
      const { isError, reply } = await (
        await openSession({ intervals })
      ).call("get_workout", { eventId });
      expect(isError).toBe(true);
      expect(reply).toMatchObject({
        status: "refused",
        code: "invalid_input",
        next: INVALID_INPUT_NEXT,
      });
      expect(reply["details"]).toContain("eventId");
      expect(intervals.requests).toEqual([]);
    },
  );
});

describe("tools/list", () => {
  it("advertises each tool's own zod input schema, byte for byte", async () => {
    const reference = new McpServer(TEST_IDENTITY);
    for (const tool of TOOLS) {
      reference.registerTool(
        tool.name,
        { title: tool.title, description: tool.description, inputSchema: tool.inputSchema },
        () => ({ content: [] }),
      );
    }
    const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
    await reference.connect(serverSide);
    const client = new Client({ name: "reference", version: "0.0.0" });
    await client.connect(clientSide);
    const expected = (await client.listTools()).tools.map((tool) => [tool.name, tool.inputSchema]);
    await client.close();
    await reference.close();

    const listed = await (await openSession({ intervals: undefined })).listTools();
    expect(JSON.stringify(listed.map((tool) => [tool.name, tool.inputSchema]))).toBe(
      JSON.stringify(expected),
    );
  });
});
