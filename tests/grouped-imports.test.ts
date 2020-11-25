import { RuleTester } from 'eslint';

import rule, { ruleMessages } from '../src/grouped-imports';

const tester = new RuleTester({ parserOptions: { ecmaVersion: 2015, sourceType: 'module' } });

const ruleOptions = [
  [
    { groupName: "Contexts", pathPatterns: ["contexts/**"] },
    { groupName: "Hooks", pathPatterns: ["hooks/**"] },
    { groupName: "Assets", pathPatterns: ["**/*.{svg|jpg|jpeg}",] },
    { groupName: "Components", pathPatterns: ["components/**/*", "../**", "./**"] },
  ]
];

const messages = {
  ...ruleMessages,
  noGroupComment: (comment: string) => `No comment found for import group "${comment}"`,
};

const runNoCommentsTest = () => {
  tester.run('Test noComments rule', rule, {
    valid: [],
    invalid: [
      {
        code: `
import c from 'contexts/someContext';
      `,
        errors: [{ message: messages.noComments }],
        options: ruleOptions,
        output: `
// Contexts
import c from 'contexts/someContext';
      `,
      },
    ]
  })
}

const runNoGroupCommentTest = () => {
  tester.run('Test noGroupComment rule', rule, {
    valid: [],
    invalid: [
      {
        code: `
// some comment
import c from 'contexts/someContext';
      `,
        errors: [{ message: messages.noGroupComment('Contexts') }],
        options: ruleOptions,
        output: `
// some comment
// Contexts
import c from 'contexts/someContext';
      `,
      }
    ],
  });
};

const runMatchedItemTest = () => {
  tester.run('Test matchedItem rule', rule, {
    valid: [],
    invalid: [
      {
        code:
`import p from "components/p";

// Components
import g from "components/g";
      `,
        options: ruleOptions,
        errors: [{ message: messages.matchedItem }],
        output: 
`// Components
import p from "components/p";
import g from "components/g";
      `,
      },
      {
        code:
`
// Components
import g from "components/g";

import p from "components/p";
      `,
        options: ruleOptions,
        errors: [{ message: messages.matchedItem }],
        output: 
`// Components
import g from "components/g";
import p from "components/p";
      `,
      },
      {
        code:
`
// Components
import g from "components/g";

// Services
import s from "services/s";

import p from "components/p";
      `,
        options: ruleOptions,
        errors: [{ message: messages.matchedItem }],
        output: 
`// Components
import g from "components/g";
import p from "components/p";

// Services
import s from "services/s";
      `,
      }
    ],
  });
};

const runSequentialGroupsTest = () => {
  tester.run('Test sequentialGroups rule', rule, {
    valid: [],
    invalid: [
      {
        code:
`// Hooks
import u from "hooks/someHook";

// Contexts
import c from "contexts/someContext";
      `,
        options: ruleOptions,
        errors: [{ message: messages.sequentialGroups }],
        output: 
`// Contexts
import c from "contexts/someContext";

// Hooks
import u from "hooks/someHook";
      `,
      }
    ],
  });
};

const runSequentialItemsTest = () => {
  tester.run('Test sequentialItems rule', rule, {
    valid: [],
    invalid: [
      {
        code:
`// Components
import s from "./someSiblingPathComponent";
import p from "../shared/someParentPathComponent";
import g from "components/someGlobalComponent";
      `,
        options: ruleOptions,
        errors: [{ message: messages.sequentialItems }],
        output: 
`// Components
import g from "components/someGlobalComponent";
import p from "../shared/someParentPathComponent";
import s from "./someSiblingPathComponent";
      `,
      },
    ],
  });
};

const runFirstImportTest = () => {
  tester.run('Test firstImport rule', rule, {
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
        errors: [{ message: messages.firstImport }],
        output:
`// Contexts
import c from 'contexts/someContext';

import s from 'styles';
import check from 'dates';
      `,
      }
    ],
  });
};

const runEmptyLineAfterTest = () => {
  tester.run('Test emptyLineAfter rule', rule, {
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
        errors: [{ message: messages.emptyLineAfter }],
        output: `
// Contexts
import c from 'contexts/someContext';

// Services
import s from 'services/someService';
      `,
      }
    ],
  });
};

const runEmptyLineBeforeTest = () => {
  tester.run('Test emptyLineBefore rule', rule, {
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

const runWithoutGroupTest = () => {
  tester.run('Test importsWithoutGroup rule', rule, {
    valid: [],
    invalid: [
      {
        code:
`// Hooks
import u from "hooks/someHook";

import l from 'lists/data';
      `,
        options: ruleOptions,
        errors: [{ message: messages.importsWithoutGroup }],
        output:
`import l from 'lists/data';

// Hooks
import u from "hooks/someHook";
      `,
      }
    ],
  });
};

const runValidTest = () => {
  tester.run('Test valid imports', rule, {
    valid: [
      {
        code:`
import e from "external-module";

// Hooks
import u from "hooks/someHook";
      `,
        options: ruleOptions,
      },
    ],
    invalid: [],
  }) 
};

(() => {
  runNoCommentsTest();
  runNoGroupCommentTest();
  runMatchedItemTest();
  runSequentialGroupsTest();
  runSequentialItemsTest();
  runWithoutGroupTest();
  runFirstImportTest();
  runEmptyLineAfterTest();
  runEmptyLineBeforeTest();
  runValidTest();
})();
