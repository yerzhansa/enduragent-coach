import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export interface Finding {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly rule: string;
  readonly message: string;
}

export function finding(
  file: string,
  rule: string,
  message: string,
  line = 1,
  column = 1,
): Finding {
  return { file, line, column, rule, message };
}

export function formatFindings(findings: readonly Finding[]): string {
  return findings
    .toSorted((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column)
    .map((item) => `${item.file}:${item.line}:${item.column}  ${item.rule}  ${item.message}`)
    .join("\n");
}

export function isEntry(entryUrl: string): boolean {
  const script = process.argv[1];
  return script !== undefined && pathToFileURL(resolve(script)).href === entryUrl;
}

export function runGate(
  entryUrl: string,
  gateName: string,
  main: () => Promise<readonly Finding[]>,
): void {
  if (!isEntry(entryUrl)) return;
  main().then(
    (findings) => {
      if (findings.length === 0) {
        process.stdout.write(`${gateName}: ok\n`);
        return;
      }
      process.stderr.write(
        `${formatFindings(findings)}\n${gateName}: ${findings.length} finding(s)\n`,
      );
      process.exitCode = 1;
    },
    (error: unknown) => {
      process.stderr.write(
        `${gateName}: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
      );
      process.exitCode = 1;
    },
  );
}

export function positionAt(
  text: string,
  offset: number,
): { readonly line: number; readonly column: number } {
  const before = text.slice(0, offset);
  const lineStart = before.lastIndexOf("\n") + 1;
  return { line: before.split("\n").length, column: offset - lineStart + 1 };
}
