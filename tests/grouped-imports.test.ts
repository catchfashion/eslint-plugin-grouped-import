import { RuleTester } from 'eslint';

import rule, { ruleMessages } from '../src/grouped-imports';

const tester = new RuleTester({ parserOptions: { ecmaVersion: 2015, sourceType: 'module' } });

const ruleOptions = [
  [
    { groupName: "CatchModule", pathPatterns: ["@catchfashion"] },
    { groupName: "CatchVariation", pathPatterns: ["CATCH"] },
    { groupName: "Contexts", pathPatterns: ["contexts/**/*"] },
    { groupName: "Hooks", pathPatterns: ["hooks/**/*"] },
    { groupName: "Services", pathPatterns: ["services/**/*"] },
    { groupName: "Models", pathPatterns: ["models/**/*"] },
    { groupName: "Helpers", pathPatterns: ["helpers/**/*"] },
    { groupName: "Assets", pathPatterns: ["**/*.{svg|jpg|jpeg}",] },
    { groupName: "Components", pathPatterns: ["components/**/*"] },
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

/* 
const runSequentialImportsTest = () => {
  tester.run('Test sequentialImports rule', rule, {
    valid: [],
    invalid: [
      {
        code: `
// api
import {
  uploadCandidateFile,
  removeCandidateFile,
  downloadCandidateFile,
} from 'api/candidate';

// api, selectors
import select from 'selectors/main';
      `,
        options: ruleOptions,
        errors: [{ message: messages.sequentialImports }],
        output: `
// api
// api, selectors
import {
  uploadCandidateFile,
  removeCandidateFile,
  downloadCandidateFile,
} from 'api/candidate';
import select from 'selectors/main';
      `,
      }
    ],
  });
};
*/

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
  // runSequentialImportsTest();
  runWithoutGroupTest();
  runFirstImportTest();
  runEmptyLineAfterTest();
  runEmptyLineBeforeTest();
  runValidTest();
})();
