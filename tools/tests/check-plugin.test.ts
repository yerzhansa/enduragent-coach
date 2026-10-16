import { describe, expect, it } from "vitest";
import {
  checkPlugin,
  parseFrontmatter,
  parseLaunchSpec,
  type PluginFiles,
  type SkillFile,
} from "../check-plugin.js";

const skill = (folder: string, body: string, name = folder): SkillFile => ({
  folder,
  path: `skills/${folder}/SKILL.md`,
  frontmatter: { name, description: "When to use it." },
  body,
});

const valid: PluginFiles = {
  packageJson: {
    name: "enduragent-coach",
    version: "0.1.0",
    type: "module",
    repository: { type: "git", url: "git+https://github.com/yerzhansa/enduragent-coach.git" },
    bin: { "enduragent-coach": "dist/server.js" },
    files: ["dist/server.js"],
    engines: { node: ">=20" },
    scripts: { bundle: "tsx tools/bundle.ts" },
  },
  pluginJson: {
    name: "enduragent-coach",
    displayName: "Enduragent Coach",
    version: "0.1.0",
    description: "Cycling and strength workouts.",
    logo: "assets/logo.svg",
    variables: {
      type: "object",
      properties: { INTERVALS_API_KEY: { type: "string", title: "Key", description: "Your key." } },
      required: ["INTERVALS_API_KEY"],
    },
  },
  mcpJson: {
    mcpServers: {
      "enduragent-coach": {
        command: "npx",
        args: ["-y", "github:yerzhansa/enduragent-coach#v0.1.0"],
        env: { INTERVALS_API_KEY: "${INTERVALS_API_KEY}" },
      },
    },
  },
  skills: [
    skill(
      "intervals-icu-workouts",
      "Call `create_cycling_workout`, then `get_workout`. On `duplicate_found` ask; on `past_date_refused` pick today. Use `percent_ftp`.",
    ),
    skill("strength-workouts", "Call create_strength_workout."),
  ],
  existingPaths: new Set(["assets/logo.svg"]),
};

const messages = (files: PluginFiles): readonly string[] =>
  checkPlugin(files).map((item) => item.message);

describe("checkPlugin", () => {
  it("accepts a consistent plugin", () => {
    expect(messages(valid)).toEqual([]);
  });

  it("refuses any script name that makes npx install devDependencies, and workspaces", () => {
    const found = messages({
      ...valid,
      packageJson: {
        ...valid.packageJson,
        scripts: { build: "x", prepare: "y" },
        workspaces: ["a"],
      },
    });
    expect(found).toEqual([
      expect.stringContaining('script "build"'),
      expect.stringContaining('script "prepare"'),
      expect.stringContaining("workspaces"),
    ]);
  });

  it("refuses runtime dependencies, an extra bin and a wider files list", () => {
    expect(
      messages({
        ...valid,
        packageJson: {
          ...valid.packageJson,
          dependencies: { zod: "4" },
          bin: { a: "dist/server.js", b: "x" },
          files: ["dist"],
        },
      }),
    ).toHaveLength(3);
  });

  it("requires the mcp.json tag to equal the package version", () => {
    const mcpJson = {
      mcpServers: {
        "enduragent-coach": {
          command: "npx",
          args: ["-y", "github:yerzhansa/enduragent-coach#v0.0.9"],
        },
      },
    };
    expect(messages({ ...valid, mcpJson })).toEqual([
      expect.stringContaining("launch version 0.0.9"),
    ]);
  });

  it("requires every ${VAR} in mcp.json to be declared", () => {
    const mcpJson = {
      mcpServers: {
        "enduragent-coach": {
          command: "npx",
          args: ["-y", "github:yerzhansa/enduragent-coach#v0.1.0"],
          env: { TOKEN: "${OTHER_TOKEN}" },
        },
      },
    };
    expect(messages({ ...valid, mcpJson })).toEqual([
      expect.stringContaining("${OTHER_TOKEN} is not declared"),
    ]);
  });

  it("requires plugin and package to agree on name and version, and the logo to exist", () => {
    expect(
      messages({
        ...valid,
        pluginJson: { ...valid.pluginJson, name: "Coach", version: "0.2.0" },
        existingPaths: new Set(),
      }),
    ).toHaveLength(4);
  });

  it("requires skill names to equal folders and skills to mention exactly the server's tools and known codes", () => {
    expect(
      messages({
        ...valid,
        skills: [
          skill(
            "strength-workouts",
            "Call create_strength_workout or intervals_create_workout. On `quota_exceeded` stop.",
            "strength",
          ),
        ],
      }),
    ).toEqual([
      'frontmatter name "strength" must equal its folder "strength-workouts"',
      "`quota_exceeded` is not a reply status, refusal code, tool name or schema value",
      "no skill mentions create_cycling_workout",
      "no skill mentions get_workout",
    ]);
  });
});

describe("parseLaunchSpec", () => {
  it("reads a pinned github tag and a pinned npm version", () => {
    expect(parseLaunchSpec(["-y", "github:yerzhansa/enduragent-coach#v0.1.0"])).toEqual({
      source: "github",
      repo: "yerzhansa/enduragent-coach",
      version: "0.1.0",
    });
    expect(parseLaunchSpec(["-y", "enduragent-coach@0.1.0"])).toEqual({
      source: "npm",
      packageName: "enduragent-coach",
      version: "0.1.0",
    });
  });

  it("rejects unpinned specs", () => {
    expect(parseLaunchSpec(["-y", "github:yerzhansa/enduragent-coach"])).toBeUndefined();
    expect(parseLaunchSpec(["-y", "enduragent-coach@latest"])).toBeUndefined();
  });
});

describe("parseFrontmatter", () => {
  it("reads plain, quoted and folded values", () => {
    expect(
      parseFrontmatter(
        '---\nname: power-zones\ndescription: >\n  Use for zones\n  and targets.\ntitle: "Zones"\n---\n# Body\n',
      ),
    ).toEqual({
      frontmatter: {
        name: "power-zones",
        description: "Use for zones and targets.",
        title: "Zones",
      },
      body: "# Body\n",
    });
  });

  it("returns undefined without a frontmatter block", () => {
    expect(parseFrontmatter("# Just a body\n")).toBeUndefined();
  });
});
