import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type FileKind = "typescript" | "markdown" | "json";

export interface RepoFile {
  readonly path: string;
  readonly kind: FileKind;
  readonly text: string;
}

export interface FileQuery {
  readonly kinds: readonly FileKind[];
  readonly under: readonly string[];
  readonly except?: readonly string[];
}

export const ALWAYS_EXCLUDED: readonly string[] = ["dist/", "node_modules/", "pnpm-lock.yaml"];

const KIND_BY_EXTENSION: Readonly<Record<string, FileKind>> = {
  ".ts": "typescript",
  ".md": "markdown",
  ".json": "json",
};

export function fileKind(path: string): FileKind | undefined {
  const dot = path.lastIndexOf(".");
  return dot === -1 ? undefined : KIND_BY_EXTENSION[path.slice(dot)];
}

export function isUnder(path: string, roots: readonly string[]): boolean {
  return (
    roots.length === 0 ||
    roots.some((root) => path === root || path.startsWith(`${root.replace(/\/$/, "")}/`))
  );
}

export function gitFiles(root: string): readonly string[] {
  const listed = spawnSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    {
      cwd: root,
      encoding: "utf8",
    },
  );
  if (listed.status !== 0) throw new Error(`git ls-files failed: ${listed.stderr}`);
  return listed.stdout
    .split("\0")
    .filter((path) => path !== "" && existsSync(join(root, path)))
    .toSorted();
}

export function listRepoFiles(root: string, query: FileQuery): readonly RepoFile[] {
  const except = new Set(query.except ?? []);
  return gitFiles(root).flatMap((path) => {
    const kind = fileKind(path);
    if (kind === undefined || !query.kinds.includes(kind)) return [];
    if (ALWAYS_EXCLUDED.some((excluded) => path.startsWith(excluded)) || except.has(path))
      return [];
    if (!isUnder(path, query.under)) return [];
    return [{ path, kind, text: readFileSync(join(root, path), "utf8") }];
  });
}
