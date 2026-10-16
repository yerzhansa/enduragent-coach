import ts from "typescript";
import { commentRanges } from "./lib/comments.js";
import { finding, positionAt, runGate, type Finding } from "./lib/gate.js";
import { listRepoFiles, type FileKind } from "./lib/repo-files.js";

export const FORBIDDEN_ACRONYMS: Readonly<Record<string, string>> = {
  CTL: "Fitness",
  ATL: "Fatigue",
  TSB: "Form",
  TSS: "Load",
  IF: "Intensity",
  NP: "weighted average power",
};

export const FORBIDDEN_PHRASES: Readonly<Record<string, string>> = {
  "normalized power": "weighted average power",
  "norm power": "weighted average power",
  "chronic training load": "Fitness",
  "acute training load": "Fatigue",
  "training stress balance": "Form",
  "training stress score": "Load",
  "intensity factor": "Intensity",
};

export const SELF_PATHS: readonly string[] = [
  "tools/check-trademarks.ts",
  "tools/tests/check-trademarks.test.ts",
];

export const SCANNED: readonly string[] = [
  "server",
  "tools",
  "skills",
  "README.md",
  ".cursor-plugin/plugin.json",
];

function alternation(terms: readonly string[]): string {
  return terms
    .toSorted((a, b) => b.length - a.length)
    .map((term) => `\\b${term.replace(/\s+/g, "\\s+")}\\b`)
    .join("|");
}

const ACRONYM_PATTERN = new RegExp(alternation(Object.keys(FORBIDDEN_ACRONYMS)), "g");
const PHRASE_PATTERN = new RegExp(alternation(Object.keys(FORBIDDEN_PHRASES)), "gi");

interface Hit {
  readonly offset: number;
  readonly term: string;
  readonly replacement: string;
}

function matchesOf(
  text: string,
  baseOffset: number,
  pattern: RegExp,
  replacementFor: (term: string) => string | undefined,
): readonly Hit[] {
  return [...text.matchAll(pattern)].map((match) => {
    const term = match[0].replace(/\s+/g, " ");
    return {
      offset: baseOffset + match.index,
      term,
      replacement: replacementFor(term) ?? "plain words",
    };
  });
}

function hitsIn(text: string, baseOffset: number): readonly Hit[] {
  return [
    ...matchesOf(text, baseOffset, ACRONYM_PATTERN, (term) => FORBIDDEN_ACRONYMS[term]),
    ...matchesOf(text, baseOffset, PHRASE_PATTERN, (term) => FORBIDDEN_PHRASES[term.toLowerCase()]),
  ].toSorted((a, b) => a.offset - b.offset);
}

function jsonHits(path: string, text: string): readonly Hit[] {
  const sourceFile = ts.parseJsonText(path, text);
  const hits: Hit[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAssignment(node)) {
      visit(node.initializer);
      return;
    }
    if (ts.isStringLiteral(node)) hits.push(...hitsIn(node.text, node.getStart(sourceFile) + 1));
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return hits;
}

function typeScriptHits(path: string, text: string): readonly Hit[] {
  const sourceFile = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const hits: Hit[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      hits.push(...hitsIn(node.text, node.getStart(sourceFile) + 1));
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  for (const range of commentRanges(sourceFile)) {
    hits.push(...hitsIn(text.slice(range.pos, range.end), range.pos));
  }
  return hits;
}

export function blankCodeFences(markdown: string): string {
  return markdown.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, (block) =>
    block.replace(/[^\n]/g, " "),
  );
}

const HITS_BY_KIND: Readonly<Record<FileKind, (path: string, text: string) => readonly Hit[]>> = {
  typescript: typeScriptHits,
  markdown: (_path, text) => hitsIn(blankCodeFences(text), 0),
  json: jsonHits,
};

export function findTrademarks(path: string, text: string, kind: FileKind): readonly Finding[] {
  return HITS_BY_KIND[kind](path, text).map((hit) => {
    const { line, column } = positionAt(text, hit.offset);
    return finding(
      path,
      "trademark",
      `"${hit.term}": use "${hit.replacement}" instead`,
      line,
      column,
    );
  });
}

runGate(import.meta.url, "check-trademarks", async () =>
  listRepoFiles(process.cwd(), {
    kinds: ["typescript", "markdown", "json"],
    under: SCANNED,
    except: SELF_PATHS,
  }).flatMap((file) => findTrademarks(file.path, file.text, file.kind)),
);
