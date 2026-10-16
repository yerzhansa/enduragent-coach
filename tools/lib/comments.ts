import ts from "typescript";

export function commentRanges(sourceFile: ts.SourceFile): readonly ts.CommentRange[] {
  const text = sourceFile.text;
  const ranges = new Map<number, ts.CommentRange>();
  const visit = (node: ts.Node): void => {
    const children = node.getChildren(sourceFile);
    if (children.length > 0) {
      for (const child of children) visit(child);
      return;
    }
    for (const range of ts.getLeadingCommentRanges(text, node.pos) ?? [])
      ranges.set(range.pos, range);
    for (const range of ts.getTrailingCommentRanges(text, node.end) ?? [])
      ranges.set(range.pos, range);
  };
  visit(sourceFile);
  return [...ranges.values()].toSorted((a, b) => a.pos - b.pos);
}
