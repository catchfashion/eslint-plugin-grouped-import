import { RuleTester } from "eslint";

import rule, { ruleMessages } from "../src/grouped-imports";

const tester = new RuleTester({ parserOptions: { ecmaVersion: 2015, sourceType: "module" } });

const ruleOptions = [
  {
    groups: [
      { groupName: "Assets", paths: ["svg", "jpg", "png"] },
      { groupName: "Contexts", paths: ["contexts"] },
      { groupName: "Hooks", paths: ["hooks"] },
      { groupName: "Components", paths: ["components", "containers"] },
    ],
    ignore: ["styled-components"],
  },
];

const messages = {
  ...ruleMessages,
  noGroupComment: (comment: string) => `No comment found for import group "${comment}"`,
};

const mockDirectory = "/some/path";
jest.spyOn(process, "cwd").mockReturnValue(mockDirectory);

const runNoGroupCommentTest = () => {
  tester.run("Test noGroupComment rule", rule, {
    valid: [],
    invalid: [
      {
        code: `
// some comment
import c from 'contexts/someContext';
      `,
        errors: [{ message: messages.noGroupComment("Contexts") }],
        options: ruleOptions,
        filename: mockDirectory + "/test",
        output: `
// some comment
// Contexts
import c from 'contexts/someContext';
      `,
      },
    ],
  });
};

const runMatchedItemTest = () => {
  tester.run("Test matchedItem rule", rule, {
    valid: [],
    invalid: [
      {
        code: `import p from "components/p";

// Components
import g from "components/g";
      `,
        options: ruleOptions,
        filename: mockDirectory + "/test",
        errors: [{ message: messages.matchedItem }],
        output: `// Components
import p from "components/p";
import g from "components/g";
      `,
      },
      {
        code: `
// Components
import g from "components/g";

import p from "components/p";
      `,
        options: ruleOptions,
        filename: mockDirectory + "/test",
        errors: [{ message: messages.matchedItem }],
        output: `// Components
import g from "components/g";
import p from "components/p";
      `,
      },
      {
        code: `
// Components
import g from "components/g";

// Services
import s from "services/s";

import p from "components/p";
      `,
        options: ruleOptions,
        filename: mockDirectory + "/test",
        errors: [{ message: messages.matchedItem }],
        output: `// Components
import g from "components/g";
import p from "components/p";

// Services
import s from "services/s";
      `,
      },
    ],
  });
};

const runSequentialGroupsTest = () => {
  tester.run("Test sequentialGroups rule", rule, {
    valid: [],
    invalid: [
      {
        code: `// Hooks
import u from "hooks/someHook";

// Contexts
import c from "contexts/someContext";
      `,
        options: ruleOptions,
        filename: mockDirectory + "/test",
        errors: [{ message: messages.sequentialGroups }],
        output: `// Contexts
import c from "contexts/someContext";

// Hooks
import u from "hooks/someHook";
      `,
      },
    ],
  });
};

const runGlobalItemsFirstTest = () => {
  tester.run("Test globalItemsFirst rule", rule, {
    valid: [],
    invalid: [
      {
        code: `// Components
import s from "./someRelativePathComponent";
import g from "components/someGlobalComponent";
      `,
        options: ruleOptions,
        filename: mockDirectory + "/containers/somePage",
        errors: [{ message: messages.globalItemsFirst }],
        output: `// Components
import g from "components/someGlobalComponent";
import s from "./someRelativePathComponent";
      `,
      },
    ],
  });
};

const runAlphabeticalItemsTest = () => {
  tester.run("Test alphabeticalItems rule", rule, {
    valid: [],
    invalid: [
      {
        code: `// Components
import c from "components/a/c";
import b2 from "components/a/b2";
import b1 from "components/a/b1";
import a from "components/a";
      `,
        options: ruleOptions,
        filename: mockDirectory + "/test",
        errors: [{ message: messages.alphabeticalItems }],
        output: `// Components
import a from "components/a";
import b1 from "components/a/b1";
import b2 from "components/a/b2";
import c from "components/a/c";
      `,
      },
      {
        code: `import u from "use-query-params";
import qs from "qs";
import _ from "lodash";
      `,
        options: ruleOptions,
        filename: mockDirectory + "/test",
        errors: [{ message: messages.alphabeticalItems }],
        output: `import _ from "lodash";
import qs from "qs";
import u from "use-query-params";
      `,
      },
      {
        code: `// Components
import s from "./someSiblingPathComponent";
import p from "../shared/someParentPathComponent";
      `,
        options: ruleOptions,
        filename: mockDirectory + "/containers/someContainer",
        errors: [{ message: messages.alphabeticalItems }],
        output: `// Components
import p from "../shared/someParentPathComponent";
import s from "./someSiblingPathComponent";
      `,
      },
    ],
  });
};

const runFirstImportTest = () => {
  tester.run("Test firstImport rule", rule, {
    valid: [],
    invalid: [
      {
        code: `
// Contexts
import s from 'styles';
import check from 'dates';
import c from 'contexts/someContext';
      `,
        options: ruleOptions,
        filename: mockDirectory + "/test",
        errors: [{ message: messages.firstImport }],
        output: `// Contexts
import c from 'contexts/someContext';

import s from 'styles';
import check from 'dates';
      `,
      },
    ],
  });
};

const runEmptyLineAfterTest = () => {
  tester.run("Test emptyLineAfter rule", rule, {
    valid: [],
    invalid: [
      {
        code: `
// Contexts
import c from 'contexts/someContext';
// Services
import s from 'services/someService';
      `,
        options: ruleOptions,
        filename: mockDirectory + "/test",
        errors: [{ message: messages.emptyLineAfter }],
        output: `
// Contexts
import c from 'contexts/someContext';

// Services
import s from 'services/someService';
      `,
      },
    ],
  });
};

const runEmptyLineBeforeTest = () => {
  tester.run("Test emptyLineBefore rule", rule, {
    valid: [],
    invalid: [
      {
        code: `
// unnamed
import p from 'data/promotion';
// Contexts
import c from 'contexts/someContext';
      `,
        options: ruleOptions,
        filename: mockDirectory + "/test",
        errors: [{ message: messages.emptyLineBefore }],
        output: `
// unnamed
import p from 'data/promotion';

// Contexts
import c from 'contexts/someContext';
      `,
      },
    ],
  });
};

const runUngroupedItems = () => {
  tester.run("Test ungroupedItems rule", rule, {
    valid: [],
    invalid: [
      {
        code: `// Hooks
import u from "hooks/someHook";

import l from 'lists/data';
      `,
        options: ruleOptions,
        filename: mockDirectory + "/test",
        errors: [{ message: messages.ungroupedItems }],
        output: `import l from 'lists/data';

// Hooks
import u from "hooks/someHook";
      `,
      },
    ],
  });
};

const runValidTest = () => {
  tester.run("Test valid imports", rule, {
    valid: [
      {
        code: ``,
        options: ruleOptions,
        filename: mockDirectory + "/test",
      },
      {
        code: `
import { useLocation } from "react-router-dom";
        `,
        options: ruleOptions,
        filename: mockDirectory + "/test",
      },
      {
        code: `
import e from "external-module";

// Hooks
import u from "hooks/someHook";
      `,
        options: ruleOptions,
        filename: mockDirectory + "/test",
      },
      {
        code: `
import styled from "styled-components";

// Components
import c from "components/someComponent";
      `,
        options: ruleOptions,
        filename: mockDirectory + "/test",
      },
    ],
    invalid: [],
  });
};

(() => {
  runNoGroupCommentTest();
  runMatchedItemTest();
  runSequentialGroupsTest();
  runGlobalItemsFirstTest();
  runAlphabeticalItemsTest();
  runFirstImportTest();
  runEmptyLineAfterTest();
  runEmptyLineBeforeTest();
  runUngroupedItems();
  runValidTest();
})();
