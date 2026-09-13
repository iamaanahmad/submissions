# Household Relay submission package

Prepared September 13, 2026. This package is published for review; the contest entry remains unsubmitted.
Registration, personal eligibility, license scope, repository license detection, and final legal acceptance remain unresolved.

## Submission fields

- Project name: Household Relay.
- Short description: Coordinate dinner, shopping, and school mornings within household constraints.
- Primary track: Alexa+ experience simulation.
- Mini challenges: none claimed. AWS services are not used. Open-source eligibility remains unresolved.
- [Public source repository](https://github.com/iamaanahmad/submissions/tree/main/alexa-household-agent).
- [Public 65-second YouTube demonstration](https://www.youtube.com/watch?v=vQkqXXfnG3c).
- [Tested source download and English video captions](https://github.com/iamaanahmad/submissions/releases/tag/relay-judge-bundle-20260912).
- [Setup and architecture](README.md).

The download contains the September 12 code and earlier preparation text. This document contains the current submission wording.
The code has not changed since that recording. No hosted public app or live Amazon integration is claimed.

## Proposed description

Household Relay turns three common household goals into a visible shared plan. It checks dinner against school pickup, pantry stock, and a spending limit. It creates a shopping draft only for missing ingredients. A separate synthetic morning routine accounts for rain.

The planner shows its tool trace and explains when no plan fits. A simulated reminder outage retains a checkpoint. Refreshing and retrying restores the workflow without duplicate steps.

This entry uses the permitted Alexa+ experience simulation path. It uses an original rule-based planner with synthetic adapters. It does not connect to Amazon services or claim live Alexa support. AI assistance helped produce the implementation and tests.

## Product feedback

### Simulation route

The published simulation option allowed a working prototype without Amazon hardware, credentials, or paid runtime.
The first working example was a local dinner plan with synthetic calendar and pantry data.
No Amazon SDK was installed, so Amazon API performance, documentation quality, and SDK onboarding remain untested.
We would continue prototyping this way. Production use requires a real integration and household testing.

### Node.js and its built-in test runner

Node.js serves the demonstration and runs the planner tests. The project requires Node.js 22 or later.
Setup uses the commands below, with no package installation or external services.
All 31 tests and five judge scenarios passed again on September 13.
Earlier malformed-request handling needed correction in our server. This was our implementation defect, not an Amazon or Node.js defect.
We would use this setup again for reproducible, dependency-free simulations.

### Browser storage, Web Locks, and DOM rendering

Browser storage retains the synthetic plan across refreshes. Web Locks coordinate saves and resets across tabs.
DOM text rendering displays tool results without interpreting them as HTML.
Storage can fail or fill up. Safe saving also requires Web Locks on HTTPS or localhost.
The app keeps an explicitly unsaved preview when persistence is unavailable.
Busy or stale tabs cannot overwrite a newer saved plan through the current app.
We would reuse these APIs for local prototypes. Shared household use would require cross-device persistence and a privacy review.
These are browser constraints and implementation lessons, not Amazon SDK friction or a claimed judging bonus.

## Judge access and checks

Use Node.js 22 or later. Download and extract the linked ZIP, then run:

```sh
cd alexa-household-agent
npm test
npm run judge
npm start
```

Open http://localhost:4173 in a current browser. No login, API key, payment, or package installation is needed.
Select **Try a service failure**, then **Reset this demo** to remove the synthetic browser state after testing.

The five automated judge checks cover:

1. A pantry dinner costs $0 and retains school pickup.
2. An empty pantry produces a $9 shopping draft for two people.
3. An impossible budget removes outdated evening steps.
4. A saved outage resumes without duplicates after reload and repeated retry.
5. A new dinner clears an outdated shopping list while preserving morning steps.

The 31-test suite includes 144 synthetic constraint combinations. These are not live household outcomes or measured win odds.
The judge command does not verify the browser interface or Amazon services.
The published video shows the browser workflow; cross-tab locking is covered by tests, not shown in that video.

## Current demo

The linked public video runs for 65 seconds and has English captions.
It shows pantry planning, budget refusal, a simulated reminder outage, refresh recovery, and retry without duplicate steps.
No new recording is required for this documentation update because runtime code is unchanged.

## Optional longer demo outline

This outline is preparation material, not a second published video.

Target duration: 90–120 seconds, below the three-minute limit.

Show the problem: pickup, dinner, and a limited budget compete for one evening. Show the simulation label.

Make the default dinner plan. Point out pickup, the meal, and $0 extra spending. Open the trace to show synthetic calendar, pantry, search, and reminders.

Clear the pantry and run again. Show the $9 wraps plan. Set budget to zero and show refusal, not a false success.

Restore the budget and enable the reminder outage. Run, refresh, disable the outage, and retry. Show the saved steps once.

Close with the measured checks: 31 automated tests, including 144 fixture combinations. State that the planner is simulated, with no real purchases or messages.

Browser storage failure also permits an explicitly unsaved preview, service retry, and recovery when saving works again. These browser checks were tested with injected storage failures, not measured household usage.

## Final validation

- Confirm entrant account, majority age, location, and conflict exclusions.
- Approve and install a qualifying license with an appropriate repository scope.
- Recheck the linked public YouTube video for anonymous playback before submitting. Its September 12 publication is complete.
- Recheck the official rules, deadline, judging requirements, and repository access.
- Transfer this description and product feedback into Devpost after registration. Check actual field limits before submission.
- Obtain task-bound legal approval before accepting new agreements or publicity rights.
- Submit once and save the receipt identifier, URL, and UTC timestamp.

## Remaining quality work

This is a constrained prototype. A final competitive review must assess usefulness, implementation, originality, and presentation. Do not describe it as a live Amazon integration or count code publication as a contest submission.
