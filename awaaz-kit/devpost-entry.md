# Kiroween 2026 entry copy

Category: Skeleton Crew

## Project description

Awaaz Kit helps small shops turn a customer's shopping request into a checked order or cash memo. The starter kit powers two separate web apps from one shared engine. Order Awaaz builds orders. Bill Awaaz builds cash memos with exact totals.

Both apps accept typed Hindi, Hinglish, and English requests. Labelled sample phrases let judges try the flow without a microphone. The app turns a request into editable lines, flags unclear products or quantities, and waits for explicit confirmation before saving anything. It stores work on the device first. Optional Appwrite sync starts only after the user opts in and signs in.

The shared packages handle language normalization, intent extraction, catalog matching, review gates, local storage, and sync. The two apps live in `apps/order-awaaz` and `apps/bill-awaaz`. A small appointment adapter in `examples/appointment-workflow` shows how a third workflow can reuse the engine without changing its packages. It is an example, not a third submitted app.

Voice transcription is an unfinished part of this build. The shipping `scripted` provider does not transcribe speech. An on-device provider exists behind the same interface, but its target-device benchmark is pending. The demo must show typed input and labelled samples as such. It must not present a sample as recognized speech.

## How Kiro was used

The build follows one requirements-first Kiro spec in `.kiro/specs/awaaz-kit`. Its numbered requirements became a design, task list, and property tests. This made safety rules testable. For example, an unresolved product or quantity blocks confirmation, and storage accepts only a confirmed action.

Kiro steering files in `.kiro/steering` define the two-app scope, package boundaries, privacy rules, and test conventions. Hooks in `.kiro/hooks` run focused checks for billing, the shared engine, and storage or sync work. The repo keeps the spec, steering, hooks, and a factual development journal in `docs/kiro-journal.md` so judges can inspect how the workflow shaped the code.

Property-based tests found a real storage bug: a finalized bill item could be deleted. The fix added database delete guards. The exact counterexample and fix are recorded in `docs/kiro-journal.md`. The speech-model benchmark remains pending; Kiro's plan did not turn that open measurement into a claim of working voice.

## Links and final checks

- Live apps: https://awaazkit.vercel.app/order/ and https://awaazkit.vercel.app/bill/
- Public source: https://github.com/iamaanahmad/awaaz-kit
- Public YouTube video: https://youtu.be/wPdiOcr6eKI (checked 72.9-second typed demo; voice is unverified).
- Devpost receipt: none verified. Record the platform URL and submission time after entry.
- Confirm the entrant's sponsor and judge ties before submission.

The [official rules](https://kiroween.devpost.com/rules) close submissions December 4, 2026, at 2:00 pm Pacific Time. They require a public YouTube demo, working app links, public licensed GitHub source, a root `.kiro` folder, two app folders for Skeleton Crew, and this Kiro write-up. The video must match the working app.
