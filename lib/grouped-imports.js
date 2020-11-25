"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const lodash_1 = __importDefault(require("lodash"));
const minimatch_1 = __importDefault(require("minimatch"));
exports.ruleMessages = {
    noGroupComment: 'No comment found for import group "{{comment}}"',
    matchedItem: "Matched import item should belong to group",
    sequentialGroups: "All import groups must be sequential",
    sequentialItems: "All import items in a group must be sequential",
    firstImport: "First import in a group must be preceded by a group comment",
    emptyLineBefore: "Import group comment must be preceded by an empty line",
    emptyLineAfter: "Last import in a group must be followed by an empty line",
    importsWithoutGroup: "Imports without group must be at the top of the file",
};
const rule = {
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
                        pathPatterns: {
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
        messages: exports.ruleMessages,
    },
    create: (context) => {
        return {
            Program: (node) => {
                const options = context.options[0];
                if (node.type === "Program") {
                    const importNodes = lodash_1.default.filter(node.body, (n) => n.type === "ImportDeclaration");
                    if (importNodes.length === 0) {
                        return;
                    }
                    // check if there are imports from config
                    const importComments = node.comments ? node.comments : [];
                    const importGroups = getImportsByGroup(options, importNodes);
                    const commentKeys = options.map(({ groupName }) => groupName);
                    const sourceCode = context.getSourceCode();
                    const lines = sourceCode.lines;
                    const lastImportNode = importNodes[importNodes.length - 1];
                    const lastImportNodeLine = lastImportNode.loc.end
                        .line;
                    const reversedComments = [...importComments].reverse();
                    const lastCommentNode = lodash_1.default.find(reversedComments, (c) => lodash_1.default.includes(commentKeys, c.value.trim()));
                    const lastCommentNodeLine = lastCommentNode
                        ? lastCommentNode.loc.end.line
                        : 0;
                    const lastImportNodeRangeEnd = lastImportNode.range[1];
                    const getNewCodeLines = composeNewCodeLines(lines, lastCommentNodeLine, lastImportNodeLine);
                    importGroups.some(({ imports, groupPriority, groupName: commentKey }, importGroupIndex) => {
                        if (lodash_1.default.isEmpty(imports)) {
                            return false;
                        }
                        const importComment = lodash_1.default.find(importComments, (c) => c.value.trim() === commentKey);
                        const firstImport = imports[0].node;
                        const lastGroupImport = imports[imports.length - 1].node;
                        const firstGroupImportLine = firstImport.loc
                            .start.line;
                        const lastGroupImportLine = lastGroupImport.loc
                            .end.line;
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
                        const expectedLinesSum = lodash_1.default.sumBy(imports, ({ node }) => {
                            const start = node.loc.start.line;
                            // include eslint-disable comment in the overall line count
                            const gComment = lodash_1.default.find(importComments, (c) => c.loc.start.line === start - 1);
                            const disableLintComment = gComment && lodash_1.default.includes(gComment.value, "eslint-disable");
                            const gEnd = node.loc.end.line;
                            const end = disableLintComment ? gEnd + 1 : gEnd;
                            return end - start + 1;
                        });
                        const expectedLines = firstGroupImportLine + expectedLinesSum - 1;
                        if (expectedLines !== lastGroupImportLine) {
                            context.report({
                                node: lastGroupImport,
                                messageId: "matchedItem",
                                fix: (fixer) => {
                                    const groupImportTextRanges = [];
                                    const allGroupImportTexts = lodash_1.default.flatMap(imports, (g) => {
                                        const start = g.node.loc.start.line - 1;
                                        const end = g.node.loc.end.line;
                                        groupImportTextRanges.push([start, end - 1]);
                                        return lines.slice(start, end);
                                    });
                                    const insertAt = importComment.loc.end
                                        .line;
                                    const newLines = getNewCodeLines(allGroupImportTexts, insertAt, groupImportTextRanges);
                                    const fixes = [
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
                                    const prevImportGroupTextStart = prevImportGroup.imports[0].node.loc.start.line - 2;
                                    const prevImportGroupTextEnd = prevImportGroup.imports[0].node.loc.end.line;
                                    const currentImportGroupTextStart = firstGroupImportLine - 2;
                                    const currentImportGroupTextEnd = lastGroupImportLine;
                                    const insertAt = prevImportGroupTextStart;
                                    const newLines = getNewCodeLines([...lines.slice(currentImportGroupTextStart, currentImportGroupTextEnd), "", ...lines.slice(prevImportGroupTextStart, prevImportGroupTextEnd)], insertAt, [[prevImportGroupTextStart, prevImportGroupTextEnd - 1], [currentImportGroupTextStart, currentImportGroupTextEnd - 1]]);
                                    const fixes = [
                                        fixer.removeRange([0, lastImportNodeRangeEnd]),
                                        fixer.insertTextAfterRange([0, 0], newLines.join("\n")),
                                    ];
                                    return fixes;
                                },
                            });
                            return true;
                        }
                        const unsequentialItem = imports.find((next, index) => {
                            return index !== 0 && imports[index - 1].pathPriority > next.pathPriority;
                        });
                        const groupImportTextRanges = [];
                        const allGroupImportTexts = lodash_1.default.flatMap(unsequentialItem ? lodash_1.default.sortBy(imports, g => g.pathPriority) : imports, (g) => {
                            const start = g.node.loc.start.line - 1;
                            const end = g.node.loc.end.line;
                            groupImportTextRanges.push([start, end - 1]);
                            return lines.slice(start, end);
                        });
                        if (unsequentialItem) {
                            context.report({
                                node: unsequentialItem.node,
                                messageId: "sequentialItems",
                                fix: (fixer) => {
                                    const insertAt = importComment.loc.end
                                        .line;
                                    const newLines = getNewCodeLines(allGroupImportTexts, insertAt, groupImportTextRanges);
                                    const fixes = [
                                        fixer.removeRange([0, lastImportNodeRangeEnd]),
                                        fixer.insertTextAfterRange([0, 0], newLines.join("\n")),
                                    ];
                                    return fixes;
                                },
                            });
                            return true;
                        }
                        // check if first import is preceded by a group comment
                        if (importComment.loc &&
                            importComment.loc.start.line + 1 !== firstGroupImportLine) {
                            context.report({
                                node: firstImport,
                                messageId: "firstImport",
                                fix: (fixer) => {
                                    const commentLine = importComment.loc
                                        .start.line;
                                    const newLines = getNewCodeLines(allGroupImportTexts, commentLine < 0 ? 0 : commentLine, groupImportTextRanges);
                                    const commentEnd = lastCommentNode
                                        ? lastCommentNode.range[1]
                                        : 0;
                                    const insertAt = lastImportNodeRangeEnd > commentEnd
                                        ? lastImportNodeRangeEnd
                                        : commentEnd;
                                    const fixes = [
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
                                        return fixer.insertTextBeforeRange(importComment.range, "\n");
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
                        const importsWithGroup = lodash_1.default.flatMap(importGroups, (g) => g.imports.map(({ node }) => node));
                        const importsWithoutGroup = lodash_1.default.xor(importNodes, importsWithGroup);
                        // find first group comment, don't count other comments
                        const firstGroupImportComment = lodash_1.default.find(importComments, (c) => lodash_1.default.includes(commentKeys, c.value.trim()));
                        const importsNotAtTheTop = firstGroupImportComment
                            ? lodash_1.default.some(importsWithoutGroup, (g) => {
                                return (g.loc.start.line >
                                    firstGroupImportComment.loc.start.line);
                            })
                            : false;
                        if (importsNotAtTheTop && firstGroupImportComment) {
                            context.report({
                                node,
                                messageId: "importsWithoutGroup",
                                fix: (fixer) => {
                                    const excludeLines = [];
                                    const allImportLines = lodash_1.default.flatMap(importsWithoutGroup, (importNode) => {
                                        const start = importNode.loc.start.line - 1;
                                        const end = importNode.loc.end.line;
                                        excludeLines.push([start, end - 1]);
                                        return lines.slice(start, end);
                                    });
                                    const newLines = getNewCodeLines(allImportLines, 0, excludeLines);
                                    const end = lastImportNode.range[1];
                                    const fixes = [
                                        fixer.removeRange([0, end]),
                                        fixer.insertTextAfterRange([0, 0], newLines.join("\n")),
                                    ];
                                    return fixes;
                                },
                            });
                            return true;
                        }
                        return false;
                    });
                }
            },
        };
    },
};
const getImportsByGroup = (options, importNodes) => {
    const importGroupPriorityMap = new Map(options.map(({ groupName }, groupPriority) => [groupName, groupPriority]));
    const importGroupMap = new Map();
    function addItemToGroup(groupName, item) {
        const prevImports = importGroupMap.get(groupName);
        if (!prevImports) {
            importGroupMap.set(groupName, [item]);
        }
        else {
            importGroupMap.set(groupName, [...prevImports, item]);
        }
    }
    importNodes.forEach((node) => {
        const importValue = node.source.value;
        lodash_1.default.some(options, ({ groupName, pathPatterns }) => {
            return pathPatterns.some((pattern, pathPriority) => {
                if (minimatch_1.default(importValue, pattern)) {
                    addItemToGroup(groupName, {
                        node,
                        pathPriority,
                    });
                    return true;
                }
                return false;
            });
        });
    });
    return Array.from(importGroupMap)
        .map(([groupName, imports]) => {
        const groupPriority = importGroupPriorityMap.get(groupName);
        return {
            groupName,
            imports,
            groupPriority: groupPriority === undefined ? -1 : groupPriority,
        };
    })
        .filter(({ imports }) => imports.length > 0);
};
const composeNewCodeLines = (lines, lasCommentLine, lastImportLine) => (newLines, index, excludeLineNumbers) => {
    const sliceEnd = lastImportLine > lasCommentLine ? lastImportLine : lasCommentLine;
    const importLines = lines.slice(0, sliceEnd);
    const filteredLines = lodash_1.default.filter(importLines, (l, i) => {
        const inRange = lodash_1.default.find(excludeLineNumbers, (range) => i >= range[0] && i <= range[1]);
        return inRange === undefined;
    });
    filteredLines.splice(index, 0, "", ...newLines, "");
    const trimmedLines = lodash_1.default.filter(filteredLines, (line, index) => {
        const next = index + 1;
        const emptyLines = lodash_1.default.isEmpty(line) &&
            lodash_1.default.isEmpty(filteredLines[next]) &&
            next !== filteredLines.length;
        const emptyLineBeforeComment = lodash_1.default.isEmpty(line) && lodash_1.default.includes(filteredLines[index - 1], "//");
        const lastEmptyLine = lodash_1.default.isEmpty(line) && next === filteredLines.length;
        if (emptyLineBeforeComment) {
            return false;
        }
        return !emptyLines && !lastEmptyLine;
    });
    if (lodash_1.default.isEmpty(trimmedLines[0])) {
        return trimmedLines.slice(1);
    }
    return trimmedLines;
};
exports.default = rule;