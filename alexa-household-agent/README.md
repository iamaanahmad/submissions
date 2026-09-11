# Household Relay

A working Alexa+ experience simulation for household planning. It compares meal options against pickup time, pantry stock, and budget. It saves a household plan and resumes after a simulated reminder failure.

**Status:** working prototype, not a submitted contest entry. This is an original deterministic planning agent, not an LLM or Amazon integration. Every tool response uses synthetic data. No purchases, messages, or real calendar changes occur.

## Run it

Use Node.js 22 or later. No dependencies, accounts, API keys, or paid runtime are required.

```sh
cd alexa-household-agent
npm test
npm start
```

Open http://localhost:4173. The browser stores only this demo's synthetic state. Use **Try a service failure → Reset this demo** to remove it. Serve the four browser files together on any static host: `index.html`, `style.css`, `app.mjs`, and `engine.mjs`.

## Try the workflow

1. Keep the pantry selected and make a dinner plan. The result costs $0 extra and preserves school pickup.
2. Clear the pantry. The planner picks wraps at an estimated $9 for two people.
3. Set the budget to $0. The planner refuses an impossible plan and retires its old steps.
4. Restore the budget. Open **Try a service failure**, enable the outage, and make a plan.
5. Refresh the page. The saved checkpoint remains. Disable the outage and retry. Steps appear once.
6. Choose the rainy school morning or shopping-list goal to explore the other simulations.

## Architecture

```text
Browser form → validated household state → constraint search
                                           ↓
                  synthetic calendar / pantry / stock / weather
                                           ↓
                          plan or clear abstention
                                           ↓
                       reminder checkpoint → localStorage
```

`engine.mjs` holds pure planning, state validation, storage, and deterministic fixtures. `app.mjs` handles the form and renders text safely. `server.mjs` serves an explicit file allowlist with a restrictive Content Security Policy. Static hosts must supply their own response headers.

Dinner search filters three recipes by stock, incremental budget, and available time. It minimizes spending, then cooking time. Pickup ends at 18:30. Shopping adds 20 minutes before cooking. Stable goal identifiers replace old steps during replanning and retries.

## Evidence and limits

The test suite has 21 tests, including an exhaustive matrix of 144 deadline, budget, group-size, and pantry combinations. Accepted dinner plans fit the simulated constraints. Blocked plans have no saved dinner steps. Tests also cover stock exclusions, corrupted storage, quota errors, retry recovery, and duplicate prevention.

These are fixture results, not user outcomes. No real household or live-service reliability has been measured. Pantry items assume enough quantity. Ingredient prices are synthetic $3 units per two people. The morning routine is fixed. The app does not resolve conflicts across separate goals or understand free-form speech. Shopping lists are drafts, not orders. This prototype does not claim Amazon SDK compatibility.

## Security and privacy

The app has no external runtime requests, third-party scripts, accounts, or secrets. User-facing values use `textContent`. State is validated when loaded. Storage errors remain visible and do not claim successful persistence. The local server rejects non-GET/HEAD methods and unknown files. Malformed request URLs return 400 without stopping the server. HTTP tests verify that normal requests still work afterward. Do not put private household data into this public demonstration.

## Contest and rights

Prepared for the Alexa+ experience simulation path in [Amazon's 2026 app-development contest](https://amazonappdev2026.devpost.com/rules). Rules were checked on September 11, 2026. Submission closes October 23 at 19:00 UTC. The entrant must still confirm eligibility, registration, rights, a qualifying open-source license, a public YouTube/Vimeo video under three minutes, and legal acceptance.

No open-source license has been granted for this new folder yet. Publication for review does not resolve the contest's licensing requirement. Existing projects in this repository retain their own rights. AI assistance was used to develop and test this prototype; no human-only authorship claim is made.
