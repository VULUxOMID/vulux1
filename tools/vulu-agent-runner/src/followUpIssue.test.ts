import test from "node:test";
import assert from "node:assert/strict";

import { parseFollowUpSuggestion } from "./followUpIssue.js";

test("parseFollowUpSuggestion returns undefined for NO_FOLLOW_UP", () => {
  const parsed = parseFollowUpSuggestion(`
Work complete.

NO_FOLLOW_UP
Reason: No remaining product work.
`);

  assert.equal(parsed, undefined);
});

test("parseFollowUpSuggestion extracts structured follow-up content", () => {
  const parsed = parseFollowUpSuggestion(`
Implemented the requested change.

FOLLOW_UP_TITLE: Harden unread badge sync on thread reopen
FOLLOW_UP_SUMMARY:
- Persist unread reset through reload and app resume paths.
- Add regression coverage for the host/viewer reopen flow.
FOLLOW_UP_ACCEPTANCE:
- Reopening a thread clears unread count after reload.
- Regression test covers the reopen sequence.
`);

  assert.deepEqual(parsed, {
    title: "Harden unread badge sync on thread reopen",
    summary: [
      "Persist unread reset through reload and app resume paths.",
      "Add regression coverage for the host/viewer reopen flow.",
    ],
    acceptanceCriteria: [
      "Reopening a thread clears unread count after reload.",
      "Regression test covers the reopen sequence.",
    ],
  });
});

test("parseFollowUpSuggestion requires acceptance criteria", () => {
  const parsed = parseFollowUpSuggestion(`
FOLLOW_UP_TITLE: Missing acceptance block
FOLLOW_UP_SUMMARY:
- There is still work here.
`);

  assert.equal(parsed, undefined);
});
