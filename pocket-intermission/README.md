# Pocket Intermission

Play a small word game while AI writes your story. Keep useful ideas after the wait ends.

[Try the app](https://pocket-intermission.vibe.commonsmade.com/) · [Watch the 56-second live demo](https://github.com/iamaanahmad/submissions/releases/download/pocket-current-demo-20260914/pocket-current-workflow-20260914.mp4) · [All recordings](https://github.com/iamaanahmad/submissions/releases/tag/pocket-current-demo-20260914)

## Try it in two minutes

1. Open the app and enter a story idea. Choose **Generate** for a real AI response.
2. While it works, select three words and write a story seed.
3. Cancel the request. Your selected words and unfinished seed stay available.
4. Generate again. The current seed joins your prompt; old saved ideas do not replace current edits.
5. Save a seed or read the finished story. Reload the same tab to recover unfinished work and the latest story.

**Try demo** uses a fixed sample and makes no AI request. It is labeled separately from live output.
A real request depends on the hosted service and can time out. Cancellation stops waiting and preserves your work.

## Run the checks

Requires Node.js 22 or newer and Google Chrome or Chromium. No npm packages or account are needed.

From the repository root:

```sh
node pocket-intermission/judge.cjs
```

If Chrome has another executable name:

```sh
CHROME_BIN=chromium node pocket-intermission/judge.cjs
```

The runner launches a separate headless browser with a temporary profile.
It tests the public app, then closes that browser and deletes its profile.
It never connects to your personal browser session or reads your saved seeds.

Expected result: **50/50 checks passed** and exit code 0.
Any failed check, missing app, or setup error exits nonzero.

| Checks | Count | What they cover |
|---|---:|---|
| Unfinished work | 14 | Reload, word selection, prompt recovery, reset, malformed storage and blocked writes |
| Finished stories | 14 | Cancellation, timeout, failure, stale replies, replacement and live/demo labels |
| Story seeds | 13 | Current edits, saved fallback, reuse, copying and recovery |
| Saved-seed refresh | 9 | Same-tab copying and generation, explicit resets, legacy and invalid optional values |

The AI endpoint is blocked during automated checks. Test responses are mocked or use the labeled offline demo.
These checks prove browser behavior. They do not measure live AI quality, server security, availability or speed.
Use the live app and recordings to assess the actual integration.

Some disposable Linux containers require `POCKET_NO_SANDBOX=1` to launch Chrome.
Use this option only in an isolated container. Normal machines should retain Chrome's sandbox.

## How it works

The app was built with Commonsmade's native AI builder and runs on its hosting service.
The browser sends explicit story requests to the app's server-side `/api/story` route.
That route uses Commonsmade's provided AI runtime. No provider credentials are needed in this test kit.

A request identifier stops stale results from replacing newer work.
Cancellation, failure and timeout return to usable game state.
The last finished story retains its original live or fixed-demo label.

Saved seeds use local browser storage. Unfinished work and the latest story use same-tab session storage.
Recovery does not send another request. Closing the tab can remove session data; saved seeds stay until cleared.
Blocked storage produces a warning while editing remains available.

This folder contains verification code, not a portable copy of Commonsmade's hosted backend.
There is no local AI server setup or independent deployment recipe here.

## Evidence and limits

The main recording shows a real request, cancellation, current-seed retry, returned story and local saving.
The September 14 retry took 20.373 seconds in that recording. That single observation is not a speed guarantee.
Supporting recordings show completed-story recovery and same-tab refresh recovery.

This is an AI-assisted implementation, and live story text is AI-generated.
The entry targets Commonsmade's Make Waiting for AI Fun event.
Its judging weights are waiting experience 30%, originality 25%, native AI-agent fit 20%, repeatability 15% and execution 10%.

The contest recorded submission on September 14, 2026 at 05:38:49 UTC.
This verification kit is supporting evidence, not another submission or an award.
No new license or source-rights grant accompanies this kit.
