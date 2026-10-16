import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { TOOLS, TOOL_NAMES } from "../server/src/coach-server.js";
import { isRefusalCode, isReplyStatus } from "../server/src/tool-contract.js";
import { finding, runGate, type Finding } from "./lib/gate.js";

export const PLUGIN_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;

export const FORBIDDEN_SCRIPTS: readonly string[] = [
  "build",
  "install",
  "preinstall",
  "postinstall",
  "prepack",
  "prepare",
];

export const EXPECTED_FILES_FIELD: readonly string[] = ["dist/server.js"];
export const EXPECTED_BIN = "dist/server.js";
export const EXPECTED_NODE_ENGINE = ">=20";
export const PACKAGE_JSON = "package.json";
export const PLUGIN_JSON = ".cursor-plugin/plugin.json";
export const MCP_JSON = "mcp.json";
export const SKILLS_DIR = "skills";

export type LaunchSpec =
  | { readonly source: "github"; readonly repo: string; readonly version: string }
  | { readonly source: "npm"; readonly packageName: string; readonly version: string };

export const packageJsonSchema = z.looseObject({
  name: z.string(),
  version: z.string(),
  type: z.literal("module"),
  repository: z.object({ type: z.literal("git"), url: z.string() }),
  bin: z.record(z.string(), z.string()),
  files: z.array(z.string()),
  engines: z.object({ node: z.string() }),
  scripts: z.record(z.string(), z.string()),
  dependencies: z.record(z.string(), z.string()).optional(),
  optionalDependencies: z.record(z.string(), z.string()).optional(),
  peerDependencies: z.record(z.string(), z.string()).optional(),
  workspaces: z.unknown().optional(),
});

const variableSchema = z.strictObject({
  type: z.literal("string"),
  title: z.string().min(1),
  description: z.string().min(1),
});

export const pluginJsonSchema = z.looseObject({
  name: z.string(),
  displayName: z.string().min(1),
  version: z.string(),
  description: z.string(),
  logo: z.string(),
  variables: z.strictObject({
    type: z.literal("object"),
    properties: z.record(z.string(), variableSchema),
    required: z.array(z.string()).optional(),
  }),
});

export const mcpJsonSchema = z.strictObject({
  mcpServers: z.record(
    z.string(),
    z.strictObject({
      command: z.string(),
      args: z.array(z.string()),
      env: z.record(z.string(), z.string()).optional(),
    }),
  ),
});

export interface SkillFile {
  readonly folder: string;
  readonly path: string;
  readonly frontmatter: Readonly<Record<string, string>>;
  readonly body: string;
}

export interface PluginFiles {
  readonly packageJson: z.output<typeof packageJsonSchema>;
  readonly pluginJson: z.output<typeof pluginJsonSchema>;
  readonly mcpJson: z.output<typeof mcpJsonSchema>;
  readonly skills: readonly SkillFile[];
  readonly existingPaths: ReadonlySet<string>;
}

export function parseLaunchSpec(args: readonly string[]): LaunchSpec | undefined {
  const spec = args.filter((arg) => arg !== "-y" && arg !== "--yes");
  const [only, ...rest] = spec;
  if (only === undefined || rest.length > 0) return undefined;
  const github = /^github:([\w.-]+\/[\w.-]+)#v(\d+\.\d+\.\d+)$/.exec(only);
  if (github?.[1] !== undefined && github[2] !== undefined) {
    return { source: "github", repo: github[1], version: github[2] };
  }
  const npm = /^((?:@[\w.-]+\/)?[\w.-]+)@(\d+\.\d+\.\d+)$/.exec(only);
  if (npm?.[1] !== undefined && npm[2] !== undefined) {
    return { source: "npm", packageName: npm[1], version: npm[2] };
  }
  return undefined;
}

export function repositorySlug(url: string): string | undefined {
  return /github\.com[/:]([\w.-]+\/[\w.-]+?)(?:\.git)?$/.exec(url)?.[1];
}

function checkPackage(pkg: PluginFiles["packageJson"]): Finding[] {
  const findings: Finding[] = [];
  const report = (message: string): void => {
    findings.push(finding(PACKAGE_JSON, "package", message));
  };
  for (const script of FORBIDDEN_SCRIPTS) {
    if (script in pkg.scripts)
      report(`script "${script}" makes npx install devDependencies on every first start`);
  }
  if (pkg.workspaces !== undefined)
    report("workspaces makes npx install devDependencies on every first start");
  for (const field of ["dependencies", "optionalDependencies", "peerDependencies"] as const) {
    if (Object.keys(pkg[field] ?? {}).length > 0)
      report(`${field} must be empty: everything ships in the bundle`);
  }
  const bins = Object.entries(pkg.bin);
  const [bin, ...extraBins] = bins;
  if (bin === undefined || extraBins.length > 0 || bin[0] !== pkg.name || bin[1] !== EXPECTED_BIN) {
    report(`bin must be exactly { "${pkg.name}": "${EXPECTED_BIN}" }`);
  }
  if (JSON.stringify(pkg.files) !== JSON.stringify(EXPECTED_FILES_FIELD)) {
    report(`files must be ${JSON.stringify(EXPECTED_FILES_FIELD)}`);
  }
  if (pkg.engines.node !== EXPECTED_NODE_ENGINE)
    report(`engines.node must be "${EXPECTED_NODE_ENGINE}"`);
  return findings;
}

function checkManifest(files: PluginFiles): Finding[] {
  const { packageJson: pkg, pluginJson: plugin } = files;
  const findings: Finding[] = [];
  const report = (message: string): void => {
    findings.push(finding(PLUGIN_JSON, "manifest", message));
  };
  if (!PLUGIN_NAME_PATTERN.test(plugin.name))
    report(`name "${plugin.name}" must match ${PLUGIN_NAME_PATTERN}`);
  if (plugin.name !== pkg.name)
    report(`name "${plugin.name}" must equal package.json name "${pkg.name}"`);
  if (plugin.version !== pkg.version)
    report(`version ${plugin.version} must equal package.json version ${pkg.version}`);
  if (!/^cycling and strength\b/i.test(plugin.description))
    report('description must start with "Cycling and strength"');
  const logo = plugin.logo;
  if (logo.startsWith("/") || logo.split("/").includes(".."))
    report(`logo "${logo}" must be a relative path inside the repo`);
  else if (!files.existingPaths.has(logo)) report(`logo "${logo}" does not exist`);
  for (const required of plugin.variables.required ?? []) {
    if (!(required in plugin.variables.properties))
      report(`required variable ${required} is not declared`);
  }
  return findings;
}

function checkLaunch(files: PluginFiles): Finding[] {
  const { packageJson: pkg, pluginJson: plugin, mcpJson } = files;
  const findings: Finding[] = [];
  const report = (message: string): void => {
    findings.push(finding(MCP_JSON, "launch", message));
  };
  const servers = Object.entries(mcpJson.mcpServers);
  const [server, ...extra] = servers;
  if (server === undefined || extra.length > 0) {
    report("mcp.json must declare exactly one server");
    return findings;
  }
  const [serverName, launch] = server;
  if (serverName !== pkg.name)
    report(`server key "${serverName}" must equal package.json name "${pkg.name}"`);
  if (launch.command !== "npx") report(`command must be npx, got ${launch.command}`);
  const spec = parseLaunchSpec(launch.args);
  if (spec === undefined) {
    report(`args ${JSON.stringify(launch.args)} are not a pinned github: tag or npm version spec`);
  } else {
    if (spec.version !== pkg.version)
      report(`launch version ${spec.version} must equal package.json version ${pkg.version}`);
    if (spec.source === "github" && spec.repo !== repositorySlug(pkg.repository.url)) {
      report(`launch repo ${spec.repo} must equal package.json repository ${pkg.repository.url}`);
    }
    if (spec.source === "npm" && spec.packageName !== pkg.name)
      report(`launch package ${spec.packageName} must be ${pkg.name}`);
  }
  const texts = [launch.command, ...launch.args, ...Object.values(launch.env ?? {})];
  for (const text of texts) {
    for (const match of text.matchAll(/\$\{([^}]*)\}/g)) {
      const variable = match[1] ?? "";
      if (!(variable in plugin.variables.properties))
        report(`\${${variable}} is not declared in plugin.json variables`);
    }
  }
  return findings;
}

function schemaVocabulary(): ReadonlySet<string> {
  const words = new Set<string>();
  const collect = (node: unknown): void => {
    if (typeof node === "string") words.add(node);
    else if (Array.isArray(node)) node.forEach(collect);
    else if (typeof node === "object" && node !== null) {
      for (const [key, value] of Object.entries(node)) {
        words.add(key);
        if (key === "enum" || key === "const" || typeof value === "object") collect(value);
      }
    }
  };
  for (const tool of TOOLS) collect(z.toJSONSchema(tool.inputSchema));
  return words;
}

const TOOL_TOKEN = /\b(?:create_[a-z0-9]+_workout|get_[a-z0-9]+)\b/g;
const SNAKE_CODE = /`([a-z][a-z0-9]*(?:_[a-z0-9]+)+)`/g;

function checkSkills(skills: readonly SkillFile[]): Finding[] {
  const findings: Finding[] = [];
  if (skills.length === 0)
    findings.push(finding(SKILLS_DIR, "skills", "no skills/<name>/SKILL.md found"));
  const toolNames: ReadonlySet<string> = new Set(TOOL_NAMES);
  const vocabulary = schemaVocabulary();
  const mentioned = new Set<string>();
  for (const skill of skills) {
    const report = (message: string): void => {
      findings.push(finding(skill.path, "skills", message));
    };
    const name = skill.frontmatter["name"];
    if (name === undefined || name === "") report("frontmatter needs a name");
    else if (name !== skill.folder)
      report(`frontmatter name "${name}" must equal its folder "${skill.folder}"`);
    if ((skill.frontmatter["description"] ?? "") === "") report("frontmatter needs a description");
    const text = `${Object.values(skill.frontmatter).join("\n")}\n${skill.body}`;
    for (const match of text.matchAll(TOOL_TOKEN)) {
      if (toolNames.has(match[0])) mentioned.add(match[0]);
      else report(`${match[0]} is not a tool of this server (${TOOL_NAMES.join(", ")})`);
    }
    for (const match of text.matchAll(SNAKE_CODE)) {
      const code = match[1] ?? "";
      if (toolNames.has(code) || isRefusalCode(code) || isReplyStatus(code) || vocabulary.has(code))
        continue;
      report(`\`${code}\` is not a reply status, refusal code, tool name or schema value`);
    }
  }
  for (const tool of TOOL_NAMES) {
    if (!mentioned.has(tool))
      findings.push(finding(SKILLS_DIR, "skills", `no skill mentions ${tool}`));
  }
  return findings;
}

export function checkPlugin(files: PluginFiles): readonly Finding[] {
  return [
    ...checkPackage(files.packageJson),
    ...checkManifest(files),
    ...checkLaunch(files),
    ...checkSkills(files.skills),
  ];
}

export function parseFrontmatter(
  text: string,
): { readonly frontmatter: Record<string, string>; readonly body: string } | undefined {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (match === null) return undefined;
  const frontmatter: Record<string, string> = {};
  let current: string | undefined;
  for (const line of (match[1] ?? "").split(/\r?\n/)) {
    const entry = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (entry?.[1] !== undefined) {
      current = entry[1];
      const value = (entry[2] ?? "").trim();
      frontmatter[current] = /^[>|][+-]?$/.test(value) ? "" : value.replace(/^(["'])(.*)\1$/, "$2");
    } else if (current !== undefined && /^\s+\S/.test(line)) {
      frontmatter[current] = `${frontmatter[current] ?? ""} ${line.trim()}`.trim();
    }
  }
  return { frontmatter, body: text.slice(match[0].length) };
}

function readJson<S extends z.ZodType>(
  root: string,
  path: string,
  schema: S,
): z.output<S> | Finding {
  const full = join(root, path);
  if (!existsSync(full)) return finding(path, "missing", `${path} does not exist`);
  try {
    const parsed = schema.safeParse(JSON.parse(readFileSync(full, "utf8")));
    return parsed.success
      ? parsed.data
      : finding(path, "schema", z.prettifyError(parsed.error).replace(/\n/g, " "));
  } catch (error) {
    return finding(path, "json", error instanceof Error ? error.message : String(error));
  }
}

function isFinding(value: unknown): value is Finding {
  return typeof value === "object" && value !== null && "rule" in value && "file" in value;
}

function readSkills(root: string): readonly (SkillFile | Finding)[] {
  const dir = join(root, SKILLS_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const path = `${SKILLS_DIR}/${entry.name}/SKILL.md`;
      if (!existsSync(join(root, path))) return finding(path, "skills", "folder has no SKILL.md");
      const parsed = parseFrontmatter(readFileSync(join(root, path), "utf8"));
      return parsed === undefined
        ? finding(path, "skills", "SKILL.md must start with a --- frontmatter block")
        : { folder: entry.name, path, frontmatter: parsed.frontmatter, body: parsed.body };
    });
}

function readPluginFiles(root: string): PluginFiles | readonly Finding[] {
  const packageJson = readJson(root, PACKAGE_JSON, packageJsonSchema);
  const pluginJson = readJson(root, PLUGIN_JSON, pluginJsonSchema);
  const mcpJson = readJson(root, MCP_JSON, mcpJsonSchema);
  const skillEntries = readSkills(root);
  const failures = [packageJson, pluginJson, mcpJson, ...skillEntries].filter(isFinding);
  if (isFinding(packageJson) || isFinding(pluginJson) || isFinding(mcpJson)) return failures;
  const skills = skillEntries.filter((entry): entry is SkillFile => !isFinding(entry));
  const existingPaths = new Set([pluginJson.logo].filter((path) => existsSync(join(root, path))));
  const files = { packageJson, pluginJson, mcpJson, skills, existingPaths };
  return failures.length === 0 ? files : [...failures, ...checkPlugin(files)];
}

runGate(import.meta.url, "check-plugin", async () => {
  const files = readPluginFiles(process.cwd());
  return "packageJson" in files ? checkPlugin(files) : files;
});
