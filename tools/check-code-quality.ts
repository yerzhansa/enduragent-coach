import ts from "typescript";
import { commentRanges } from "./lib/comments.js";
import { finding, runGate, type Finding } from "./lib/gate.js";
import { listRepoFiles } from "./lib/repo-files.js";

export type CodeRule =
  | "comment"
  | "lint-suppression"
  | "double-assertion"
  | "swallowed-rejection"
  | "file-length";

export const MAX_FILE_LINES = 400;

export const CODE_RULE_GUIDANCE: Readonly<Record<CodeRule, string>> = {
  comment:
    "move the rationale to the PR description or an ADR, and make the code say it through names and structure",
  "lint-suppression": "fix the type or the code instead of suppressing the checker",
  "double-assertion": "fix the type or the code instead of suppressing the checker",
  "swallowed-rejection": "handle the error, return a typed failure, or let it propagate",
  "file-length": "split the file before adding to it",
};

const LINT_SUPPRESSION = /^\/[/*]\s*(?:eslint|oxlint)-disable/u;

function unwrap(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (ts.isParenthesizedExpression(current)) current = current.expression;
  return current;
}

function isNothing(expression: ts.Expression): boolean {
  const value = unwrap(expression);
  if (ts.isIdentifier(value)) return value.text === "undefined";
  if (value.kind === ts.SyntaxKind.NullKeyword) return true;
  if (!ts.isVoidExpression(value)) return false;
  const operand = unwrap(value.expression);
  return ts.isNumericLiteral(operand) && operand.text === "0";
}

function isSwallowedRejection(node: ts.Node): boolean {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return false;
  if (node.expression.name.text !== "catch") return false;
  const first = node.arguments[0];
  const handler = first === undefined ? undefined : unwrap(first);
  if (handler === undefined || !(ts.isArrowFunction(handler) || ts.isFunctionExpression(handler)))
    return false;
  return ts.isBlock(handler.body) ? handler.body.statements.length === 0 : isNothing(handler.body);
}

function isDoubleAssertion(node: ts.Node): boolean {
  if (!ts.isAsExpression(node)) return false;
  const inner = unwrap(node.expression);
  return ts.isAsExpression(inner) && inner.type.kind === ts.SyntaxKind.UnknownKeyword;
}

function lineCount(text: string): number {
  if (text === "") return 0;
  const breaks = text.split("\n").length - 1;
  return text.endsWith("\n") ? breaks : breaks + 1;
}

export function scanTypeScript(path: string, text: string): readonly Finding[] {
  const sourceFile = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const findings: Finding[] = [];
  const report = (rule: CodeRule, position: number): void => {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(position);
    findings.push(finding(path, rule, CODE_RULE_GUIDANCE[rule], line + 1, character + 1));
  };
  for (const range of commentRanges(sourceFile)) {
    report("comment", range.pos);
    if (LINT_SUPPRESSION.test(text.slice(range.pos, range.end)))
      report("lint-suppression", range.pos);
  }
  const visit = (node: ts.Node): void => {
    if (isSwallowedRejection(node)) report("swallowed-rejection", node.getStart(sourceFile));
    if (isDoubleAssertion(node)) report("double-assertion", node.getStart(sourceFile));
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  const lines = lineCount(text);
  if (lines > MAX_FILE_LINES) {
    findings.push(
      finding(
        path,
        "file-length",
        `${lines} lines, limit ${MAX_FILE_LINES}: ${CODE_RULE_GUIDANCE["file-length"]}`,
        lines,
      ),
    );
  }
  return findings;
}

runGate(import.meta.url, "check-code-quality", async () =>
  listRepoFiles(process.cwd(), { kinds: ["typescript"], under: [] }).flatMap((file) =>
    scanTypeScript(file.path, file.text),
  ),
);
