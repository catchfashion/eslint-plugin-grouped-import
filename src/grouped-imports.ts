import { Rule } from "eslint";
import { ImportDeclaration, SourceLocation } from "estree";
import _ from "lodash";
import path from "path";

type ImportGroups = Array<{
  groupName: string;
  groupPriority: number; // 0 is first
  imports: ImportItem[];
}>;

type ImportItem = {
  node: ImportDeclaration;
  isRelative: boolean;
};

type RuleOptions = Array<{
  groupName: string;
  paths: string[];
}>;

export const ruleMessages = {
  noGroupComment: 'No comment found for import group "{{comment}}"',
  matchedItem: "Matched import item should belong to group",
  sequentialGroups: "All import groups must be sequential",
  globalItemsFirst: "Global import items in a group must be first",
  alphabeticalItems: "All import items with the same priority in a group must be alphabetical",
  firstImport: "First import in a group must be preceded by a group comment",
  emptyLineBefore: "Import group comment must be preceded by an empty line",
  emptyLineAfter: "Last import in a group must be followed by an empty line",
  ungroupedItems: "Imports without group must be at the top of the file",
};

const rule: Rule.RuleModule = {
  meta: {
    fixable: "code",
    schema: [
      {
        type: "array",
        items: {
          type: "object",
          properties: {
            groupName: {
              type: "string",
            },
            paths: {
              type: "array",
              items: {
                type: "string",
              },
            },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: ruleMessages,
  },
  create: (context) => {
    return {
      Program: (node) => {
        const options: RuleOptions = context.options[0];
        if (node.type === "Program") {
          const importNodes = _.filter(node.body, (n) => n.type === "ImportDeclaration") as ImportDeclaration[];

          if (importNodes.length === 0) {
            return;
          }

          // check if there are imports from config

          const importComments = node.comments ? node.comments : [];
          const { importGroups, ungroupedNodes } = getImportsByGroup(
            options,
            importNodes,
            context.getFilename().slice(process.cwd().length)
          );

          const commentKeys = options.map(({ groupName }) => groupName);
          const sourceCode = context.getSourceCode();
          const lines = sourceCode.lines;
          const lastImportNode = importNodes[importNodes.length - 1];
          const lastImportNodeLine = (lastImportNode.loc as SourceLocation).end.line;
          const reversedComments = [...importComments].reverse();
          const lastCommentNode = _.find(reversedComments, (c) => _.includes(commentKeys, c.value.trim()));

          const lastCommentNodeLine = lastCommentNode ? (lastCommentNode.loc as SourceLocation).end.line : 0;
          const lastImportNodeRangeEnd = (lastImportNode.range as number[])[1];

          const getNewCodeLines = composeNewCodeLines(lines, lastCommentNodeLine, lastImportNodeLine);

          const unalphabetcialUngroupedNode = ungroupedNodes.find((next, index) => {
            if (index === 0) {
              return false;
            }
            return (ungroupedNodes[index - 1].source.value as string) > (next.source.value as string);
          });

          const importGroupsHasReport = importGroups.some(
            ({ imports, groupPriority, groupName: commentKey }, importGroupIndex) => {
              if (_.isEmpty(imports)) {
                return false;
              }

              const importComment = _.find(importComments, (c) => c.value.trim() === commentKey);
              const firstImport = imports[0].node;
              const lastGroupImport = imports[imports.length - 1].node;

              const firstGroupImportLine = (firstImport.loc as SourceLocation).start.line;
              const lastGroupImportLine = (lastGroupImport.loc as SourceLocation).end.line;

              if (!importComment) {
                context.report({
                  node: firstImport,
                  messageId: "noGroupComment",
                  data: {
                    comment: commentKey,
                  },
                  fix: (fixer) => {
                    return fixer.insertTextBefore(firstImport, `// ${commentKey}\n`);
                  },
                });
                return true;
              }

              // sum up expected lines (support for multiline imports)
              const expectedLinesSum = _.sumBy(imports, ({ node }) => {
                const start = (node.loc as SourceLocation).start.line;

                // include eslint-disable comment in the overall line count
                const gComment = _.find(importComments, (c) => (c.loc as SourceLocation).start.line === start - 1);
                const disableLintComment = gComment && _.includes(gComment.value, "eslint-disable");

                const gEnd = (node.loc as SourceLocation).end.line;
                const end = disableLintComment ? gEnd + 1 : gEnd;
                return end - start + 1;
              });

              const expectedLines = firstGroupImportLine + expectedLinesSum - 1;
              if (expectedLines !== lastGroupImportLine) {
                context.report({
                  node: lastGroupImport,
                  messageId: "matchedItem",
                  fix: (fixer) => {
                    const groupImportTextRanges: [number, number][] = [];
                    const allGroupImportTexts = _.flatMap(imports, (g) => {
                      const start = (g.node.loc as SourceLocation).start.line - 1;
                      const end = (g.node.loc as SourceLocation).end.line;
                      groupImportTextRanges.push([start, end - 1]);
                      return lines.slice(start, end);
                    });

                    const insertAt = (importComment.loc as SourceLocation).end.line;
                    const newLines = getNewCodeLines(allGroupImportTexts, insertAt, groupImportTextRanges);

                    const fixes: any = [
                      fixer.removeRange([0, lastImportNodeRangeEnd]),
                      fixer.insertTextAfterRange([0, 0], newLines.join("\n")),
                    ];

                    return fixes;
                  },
                });
                return true;
              }

              const prevImportGroup = importGroups[importGroupIndex - 1];
              if (importGroupIndex !== 0 && prevImportGroup.groupPriority > groupPriority) {
                context.report({
                  node: firstImport,
                  messageId: "sequentialGroups",
                  fix: (fixer) => {
                    const prevImportGroupTextStart =
                      (prevImportGroup.imports[0].node.loc as SourceLocation).start.line - 2;
                    const prevImportGroupTextEnd = (prevImportGroup.imports[0].node.loc as SourceLocation).end.line;
                    const currentImportGroupTextStart = firstGroupImportLine - 2;
                    const currentImportGroupTextEnd = lastGroupImportLine;
                    const insertAt = prevImportGroupTextStart;
                    const newLines = getNewCodeLines(
                      [
                        ...lines.slice(currentImportGroupTextStart, currentImportGroupTextEnd),
                        "",
                        ...lines.slice(prevImportGroupTextStart, prevImportGroupTextEnd),
                      ],
                      insertAt,
                      [
                        [prevImportGroupTextStart, prevImportGroupTextEnd - 1],
                        [currentImportGroupTextStart, currentImportGroupTextEnd - 1],
                      ]
                    );

                    const fixes: any = [
                      fixer.removeRange([0, lastImportNodeRangeEnd]),
                      fixer.insertTextAfterRange([0, 0], newLines.join("\n")),
                    ];

                    return fixes;
                  },
                });
                return true;
              }

              const unsequentialItem = imports.find((next, index) => {
                return index !== 0 && imports[index - 1].isRelative && !next.isRelative;
              });

              if (unsequentialItem) {
                const groupImportTextRanges: [number, number][] = [];
                const allGroupImportTexts = _.flatMap(
                  unsequentialItem ? _.sortBy(imports, (g) => g.isRelative) : imports,
                  (g) => {
                    const start = (g.node.loc as SourceLocation).start.line - 1;
                    const end = (g.node.loc as SourceLocation).end.line;
                    groupImportTextRanges.push([start, end - 1]);
                    return lines.slice(start, end);
                  }
                );

                context.report({
                  node: unsequentialItem.node,
                  messageId: "globalItemsFirst",
                  fix: (fixer) => {
                    const insertAt = (importComment.loc as SourceLocation).end.line;
                    const newLines = getNewCodeLines(allGroupImportTexts, insertAt, groupImportTextRanges);

                    const fixes: any = [
                      fixer.removeRange([0, lastImportNodeRangeEnd]),
                      fixer.insertTextAfterRange([0, 0], newLines.join("\n")),
                    ];

                    return fixes;
                  },
                });
                return true;
              }

              const unalphabetcialItem = imports.find((next, index) => {
                if (index === 0) {
                  return false;
                }
                const prev = imports[index - 1];
                if (prev.isRelative !== next.isRelative) {
                  return false;
                }
                return (prev.node.source.value as string) > (next.node.source.value as string);
              });

              if (unalphabetcialItem) {
                const groupImportTextRanges: [number, number][] = [];
                const allGroupImportTexts = _.flatMap(
                  _.sortBy(
                    imports,
                    (i) => i.isRelative,
                    (i) => i.node.source.value
                  ),
                  (g) => {
                    const start = (g.node.loc as SourceLocation).start.line - 1;
                    const end = (g.node.loc as SourceLocation).end.line;
                    groupImportTextRanges.push([start, end - 1]);
                    return lines.slice(start, end);
                  }
                );
                context.report({
                  node: unalphabetcialItem.node,
                  messageId: "alphabeticalItems",
                  fix: (fixer) => {
                    const insertAt = (importComment.loc as SourceLocation).end.line;
                    const newLines = getNewCodeLines(allGroupImportTexts, insertAt, groupImportTextRanges);

                    const fixes: any = [
                      fixer.removeRange([0, lastImportNodeRangeEnd]),
                      fixer.insertTextAfterRange([0, 0], newLines.join("\n")),
                    ];

                    return fixes;
                  },
                });
                return true;
              }

              const groupImportTextRanges: [number, number][] = [];
              const allGroupImportTexts = _.flatMap(imports, (g) => {
                const start = (g.node.loc as SourceLocation).start.line - 1;
                const end = (g.node.loc as SourceLocation).end.line;
                groupImportTextRanges.push([start, end - 1]);
                return lines.slice(start, end);
              });

              // check if first import is preceded by a group comment
              if (importComment.loc && importComment.loc.start.line + 1 !== firstGroupImportLine) {
                context.report({
                  node: firstImport,
                  messageId: "firstImport",
                  fix: (fixer) => {
                    const commentLine = (importComment.loc as SourceLocation).start.line;

                    const newLines = getNewCodeLines(
                      allGroupImportTexts,
                      commentLine < 0 ? 0 : commentLine,
                      groupImportTextRanges
                    );

                    const commentEnd = lastCommentNode ? (lastCommentNode.range as number[])[1] : 0;
                    const insertAt = lastImportNodeRangeEnd > commentEnd ? lastImportNodeRangeEnd : commentEnd;
                    const fixes: any = [
                      fixer.removeRange([0, insertAt]),
                      fixer.insertTextAfterRange([0, 0], newLines.join("\n")),
                    ];
                    return fixes;
                  },
                });
                return true;
              }

              // find token before the group comment
              const tokenBeforeComment = sourceCode.getTokenBefore(importComment, { skip: 0, includeComments: true });
              if (importComment.loc && tokenBeforeComment) {
                // check if line before the comment is an empty one
                const lineBeforeComment = lines[importComment.loc.start.line - 2];
                if (lineBeforeComment && lineBeforeComment.trim()) {
                  context.report({
                    loc: importComment.loc,
                    messageId: "emptyLineBefore",
                    fix: (fixer) => {
                      return fixer.insertTextBeforeRange(importComment.range as [number, number], "\n");
                    },
                  });
                  return true;
                }
              }

              const lineAfterLastImport = lines[lastGroupImportLine];
              if (lineAfterLastImport.trim()) {
                context.report({
                  node: lastGroupImport,
                  messageId: "emptyLineAfter",
                  fix: (fixer) => {
                    return fixer.insertTextAfter(lastGroupImport, "\n");
                  },
                });
                return true;
              }

              return false;
            }
          );

          if (importGroupsHasReport) {
            return;
          }

          // find first group comment, don't count other comments
          const firstGroupImportComment = _.find(importComments, (c) => _.includes(commentKeys, c.value.trim()));

          const importsNotAtTheTop = firstGroupImportComment
            ? _.some(ungroupedNodes, (g) => {
                return (
                  (g.loc as SourceLocation).start.line > (firstGroupImportComment.loc as SourceLocation).start.line
                );
              })
            : false;

          if (importsNotAtTheTop && firstGroupImportComment) {
            context.report({
              node,
              messageId: "ungroupedItems",
              fix: (fixer) => {
                const excludeLines: [number, number][] = [];
                const allImportLines: any = _.flatMap(ungroupedNodes, (importNode) => {
                  const start = (importNode.loc as SourceLocation).start.line - 1;
                  const end = (importNode.loc as SourceLocation).end.line;
                  excludeLines.push([start, end - 1]);
                  return lines.slice(start, end);
                });

                const newLines = getNewCodeLines(allImportLines, 0, excludeLines);

                const end = (lastImportNode.range as number[])[1];
                const fixes: any = [
                  fixer.removeRange([0, end]),
                  fixer.insertTextAfterRange([0, 0], newLines.join("\n")),
                ];

                return fixes;
              },
            });

            return;
          }

          if (unalphabetcialUngroupedNode) {
            const groupImportTextRanges: [number, number][] = [];
            const allGroupImportTexts = _.flatMap(
              _.sortBy(ungroupedNodes, ({ source }) => source.value),
              (g) => {
                const start = (g.loc as SourceLocation).start.line - 1;
                const end = (g.loc as SourceLocation).end.line;
                groupImportTextRanges.push([start, end - 1]);
                return lines.slice(start, end);
              }
            );
            context.report({
              node: unalphabetcialUngroupedNode,
              messageId: "alphabeticalItems",
              fix: (fixer) => {
                const insertAt = 0;
                const newLines = getNewCodeLines(allGroupImportTexts, insertAt, groupImportTextRanges);

                const fixes: any = [
                  fixer.removeRange([0, lastImportNodeRangeEnd]),
                  fixer.insertTextAfterRange([0, 0], newLines.join("\n")),
                ];

                return fixes;
              },
            });
            return;
          }
        }
      },
    };
  },
};

const getImportsByGroup = (
  options: RuleOptions,
  importNodes: ImportDeclaration[],
  currentFileName: string
): {
  importGroups: ImportGroups;
  ungroupedNodes: ImportDeclaration[];
} => {
  const importGroupPriorityMap = new Map(options.map(({ groupName }, groupPriority) => [groupName, groupPriority]));
  const importGroupMap = new Map<string, ImportItem[]>();
  const ungroupedNodeSet = new Set(importNodes);

  function addItemToGroup(
    groupName: string,
    item: {
      node: ImportDeclaration;
      isRelative: boolean;
    }
  ) {
    const prevImports = importGroupMap.get(groupName);
    ungroupedNodeSet.delete(item.node);
    if (!prevImports) {
      importGroupMap.set(groupName, [item]);
    } else {
      importGroupMap.set(groupName, [...prevImports, item]);
    }
  }

  importNodes.forEach((node) => {
    const importValue = node.source.value as string;
    const isRelative = importValue.startsWith(".");
    const targetFile = isRelative ? path.resolve(currentFileName, importValue).slice(1) : importValue;

    _.some(options, ({ groupName, paths: pathNames }) => {
      return pathNames.some((pathName) => {
        if (targetFile.includes(pathName)) {
          addItemToGroup(groupName, {
            node,
            isRelative,
          });
          return true;
        }
        return false;
      });
    });
  });

  return {
    importGroups: Array.from(importGroupMap)
      .map(([groupName, imports]) => {
        const groupPriority = importGroupPriorityMap.get(groupName);
        return {
          groupName,
          imports,
          groupPriority: groupPriority === undefined ? -1 : groupPriority,
        };
      })
      .filter(({ imports }) => imports.length > 0),
    ungroupedNodes: Array.from(ungroupedNodeSet),
  };
};

const composeNewCodeLines = (lines: string[], lasCommentLine: number, lastImportLine: number) => (
  newLines: string[],
  index: number,
  excludeLineNumbers: [number, number][]
) => {
  const sliceEnd = lastImportLine > lasCommentLine ? lastImportLine : lasCommentLine;
  const importLines = lines.slice(0, sliceEnd);

  const filteredLines = _.filter(importLines, (l, i) => {
    const inRange = _.find(excludeLineNumbers, (range) => i >= range[0] && i <= range[1]);
    return inRange === undefined;
  });

  filteredLines.splice(index, 0, "", ...newLines, "");

  const trimmedLines = _.filter(filteredLines, (line, index) => {
    const next = index + 1;
    const emptyLines = _.isEmpty(line) && _.isEmpty(filteredLines[next]) && next !== filteredLines.length;
    const emptyLineBeforeComment = _.isEmpty(line) && _.includes(filteredLines[index - 1], "//");

    const lastEmptyLine = _.isEmpty(line) && next === filteredLines.length;
    if (emptyLineBeforeComment) {
      return false;
    }
    return !emptyLines && !lastEmptyLine;
  });

  if (_.isEmpty(trimmedLines[0])) {
    return trimmedLines.slice(1);
  }

  return trimmedLines;
};

export default rule;
