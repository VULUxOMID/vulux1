import { spawnSync } from "node:child_process";

const DEFAULT_CODEX_URL = "https://chatgpt.com/codex";
const READY_CHECK_JS = String.raw`(() => {
  const editor = document.querySelector('.ProseMirror');
  const submit = Array.from(document.querySelectorAll('button')).find(
    (button) => button.getAttribute('aria-label') === 'Submit'
  );
  return editor && submit
    ? 'ready'
    : 'waiting:' + String(Boolean(editor)) + ':' + String(Boolean(submit));
})()`;
const FOCUS_EDITOR_JS = String.raw`(() => {
  const editor = document.querySelector('.ProseMirror');
  if (!editor) return 'missing-editor';
  editor.focus();
  editor.click();
  return 'focused';
})()`;
const SUBMIT_JS = String.raw`(() => {
  const submit = Array.from(document.querySelectorAll('button')).find(
    (button) => button.getAttribute('aria-label') === 'Submit'
  );
  if (!submit) return 'missing-submit';
  submit.click();
  return window.location.href || 'submitted';
})()`;
const LOCATION_JS = "window.location.href";
const PROBE_RUN_JS = String.raw`(() => {
  const buttons = Array.from(document.querySelectorAll('button')).map((button) => ({
    label: (button.getAttribute('aria-label') || '').trim(),
    text: (button.innerText || '').trim(),
    disabled: Boolean(button.disabled),
  }));
  const bodyText = document.body?.innerText || '';
  const activeMarkers = [
    'Working on your task',
    'Running command',
    'Applying patch',
    'Reading files',
    'Searching files',
    'Inspecting repository',
    'Thinking',
    'Running tests',
    'Generating',
  ].filter((marker) => bodyText.includes(marker));
  const stopLikeButtons = buttons.filter((button) =>
    /stop|cancel|interrupt/i.test(button.label || button.text)
  );
  const submitButton = buttons.find((button) => button.label === 'Submit');

  return JSON.stringify({
    href: window.location.href,
    title: document.title,
    hasEditor: Boolean(document.querySelector('.ProseMirror')),
    hasSubmit: Boolean(submitButton),
    submitDisabled: Boolean(submitButton?.disabled),
    stopLikeButtons: stopLikeButtons.map((button) => button.label || button.text),
    activeMarkers,
    bodySample: bodyText.slice(0, 1200),
    hasCreatePR: buttons.some((button) => /^Create PR$/i.test(button.text) && !button.disabled),
    hasViewPR: buttons.some((button) => /^View PR$/i.test(button.text)),
    isTaskPage: /\/codex\/tasks\//.test(window.location.href),
    latestTaskUrl: (() => { var ls = Array.from(document.querySelectorAll('a[href*="/codex/tasks/"]')); return ls.length ? ls[0].href : null; })(),
  });
})()`;

function runAppleScript(script) {
  const result = spawnSync("osascript", ["-"], {
    input: script,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "osascript failed").trim());
  }

  return (result.stdout || "").trim();
}

function appleScriptString(value) {
  return JSON.stringify(String(value));
}

function executeChromeJs(script) {
  return runAppleScript(`
tell application "Google Chrome"
  execute active tab of front window javascript ${appleScriptString(script)}
end tell
`);
}


const CLICK_CREATE_PR_JS = String.raw`(() => {
  const btn = Array.from(document.querySelectorAll('button')).find(
    (b) => /^Create PR$/i.test((b.innerText || '').trim()) && !b.disabled
  );
  if (!btn) return 'missing-create-pr';
  btn.click();
  return 'clicked-create-pr';
})()`;

export function clickCreatePRButton(targetUrl = DEFAULT_CODEX_URL) {
  ensureCodexTab(targetUrl);
  return executeChromeJs(CLICK_CREATE_PR_JS);
}

const GET_LATEST_TASK_URL_JS = String.raw`(() => {
  // Find the most recently-created task link in the Codex sidebar
  var links = Array.from(document.querySelectorAll('a[href*="/codex/tasks/"]'));
  if (links.length === 0) return null;
  return links[0].href;
})()`;

export function getLatestTaskUrl(targetUrl = DEFAULT_CODEX_URL) {
  ensureCodexTab(targetUrl);
  const result = executeChromeJs(GET_LATEST_TASK_URL_JS);
  // osascript returns "missing value" as string when JS returns null
  return (!result || result === "missing value") ? null : result;
}
export function ensureCodexTab(targetUrl = DEFAULT_CODEX_URL) {
  return runAppleScript(`
tell application "Google Chrome"
  activate
  if (count of windows) = 0 then
    make new window
  end if
  if (count of tabs of front window) = 0 then
    tell front window to make new tab
  end if
  set currentUrl to URL of active tab of front window
  if currentUrl is not ${appleScriptString(targetUrl)} then
    set URL of active tab of front window to ${appleScriptString(targetUrl)}
  end if
end tell
`);
}

export function inspectCodexRun(targetUrl = DEFAULT_CODEX_URL) {
  ensureCodexTab(targetUrl);
  const raw = executeChromeJs(PROBE_RUN_JS);
  const parsed = JSON.parse(raw);
  const hasLoadedContent = typeof parsed.bodySample === "string" && parsed.bodySample.trim().length > 0;
  const isRunning =
    parsed.activeMarkers.length > 0 ||
    parsed.stopLikeButtons.length > 0;
  const isIdle =
    !isRunning &&
    hasLoadedContent &&
    (parsed.hasEditor || parsed.hasSubmit || parsed.title === "Codex");

  return {
    ...parsed,
    status: isRunning ? "running" : isIdle ? "idle" : "unknown",
  };
}

export function waitForCodexReady(options = {}) {
  const timeoutMs = Number(options.timeoutMs || 60000);
  const pollMs = Number(options.pollMs || 1000);
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const result = executeChromeJs(READY_CHECK_JS);
    if (result === "ready") {
      return true;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, pollMs);
  }

  throw new Error("Codex tab did not become ready before timeout.");
}

export function sendPromptToCodex(prompt, options = {}) {
  const targetUrl = options.targetUrl || DEFAULT_CODEX_URL;
  ensureCodexTab(targetUrl);
  waitForCodexReady(options);
  executeChromeJs(FOCUS_EDITOR_JS);

  runAppleScript(`
set the clipboard to ${appleScriptString(prompt)}
tell application "Google Chrome" to activate
tell application "System Events"
  keystroke "v" using command down
end tell
delay 0.4
`);

  const submitResult = executeChromeJs(SUBMIT_JS);
  const chatUrl = executeChromeJs(LOCATION_JS) || submitResult || targetUrl;
  return {
    chatUrl,
    submitResult,
  };
}
