# Kiroween 2026 entry copy

Category: Skeleton Crew

## Project description

Awaaz Kit helps small shops turn a customer's shopping request into a checked order or cash memo. The starter kit powers two separate web apps from one shared engine. Order Awaaz builds orders. Bill Awaaz builds cash memos with exact totals.

Both apps accept typed Hindi, Hinglish, and English requests. Labelled sample phrases let judges try the flow without a microphone. The app turns a request into editable lines, flags unclear products or quantities, and waits for explicit confirmation before saving anything. It stores work on the device first. Optional Appwrite sync starts only after the user opts in and signs in.

The shared packages handle language normalization, intent extraction, catalog matching, review gates, local storage, and sync. The two apps live in `apps/order-awaaz` and `apps/bill-awaaz`. A small appointment adapter in `examples/appointment-workflow` shows how a third workflow can reuse the engine without changing its packages. It is an example, not a third submitted app.

## Judge path

1. Open [Order Awaaz](https://awaazkit.vercel.app/order/) and use a labelled sample or type `do kilo aata aur ek litre Amul`. The app asks you to choose an Amul product before you can confirm the order.
2. Open [Bill Awaaz](https://awaazkit.vercel.app/bill/) and type `तीन किलो आलू और दो किलो प्याज और एक किलो टमाटर`. Review the three lines and the ₹200.00 total before saving the cash memo.
3. Compare the two app folders in the [public source](https://github.com/iamaanahmad/awaaz-kit/tree/main/apps). The [reuse proof](https://github.com/iamaanahmad/awaaz-kit/blob/main/docs/reuse-proof.md) traces their shared engine imports.
4. Watch the replacement public demo once Amaan records and publishes it. Confirm its link before adding it to the entry.

On November 27, a desktop browser fed one synthetic English audio clip through each live app's fake microphone. Both apps transcribed "two kilo sugar and five kilo rice" exactly. Order Awaaz found two items, and Bill Awaaz found two lines. The [bill capture screenshot](./evidence/bill-synthetic-audio-20261127.png) shows the second result. These checks cover deployed audio paths, not real human shop speech, Hindi or Hinglish shop accuracy, or phone performance. A [reproducible model benchmark](https://github.com/iamaanahmad/awaaz-kit/blob/main/docs/model-benchmark.md) measured 25.4% word error rate on 20 real Hindi-English lecture clips. Those clips are not shop requests, and the test ran on a desktop. The replacement demo must show only behavior checked on the recorded device. It must not present a typed sample or synthetic audio as recognized human speech.

A separate November 27 live-browser check played one recorded human Hinglish lecture clip through Order Awaaz's desktop fake microphone. The app produced a transcript. It also identified three order items in the unrelated lecture, a false match. The [recorded-speech screenshot](./evidence/order-lecture-audio-20261127.png) shows the result. The clip came from the [MUCS-Hinglish test set](https://huggingface.co/datasets/dianavdavidson/MUCS-Hinglish); it was not a real shop request or a phone recording. This check proves the deployed transcription path can process one recorded human clip. It does not prove shop accuracy.

## How Kiro was used

The build follows one requirements-first Kiro spec in `.kiro/specs/awaaz-kit`. Its numbered requirements became a design, task list, and property tests. This made safety rules testable. For example, an unresolved product or quantity blocks confirmation, and storage accepts only a confirmed action.

Kiro steering files in `.kiro/steering` define the two-app scope, package boundaries, privacy rules, and test conventions. Hooks in `.kiro/hooks` run focused checks for billing, the shared engine, and storage or sync work. The repo keeps the spec, steering, hooks, and a factual development journal in `docs/kiro-journal.md` so judges can inspect how the workflow shaped the code.

The [requirements](https://github.com/iamaanahmad/awaaz-kit/blob/main/.kiro/specs/awaaz-kit/requirements.md) set the review and storage rules. The [design](https://github.com/iamaanahmad/awaaz-kit/blob/main/.kiro/specs/awaaz-kit/design.md) turns them into two workflows. The [task list](https://github.com/iamaanahmad/awaaz-kit/blob/main/.kiro/specs/awaaz-kit/tasks.md) ties implementation work back to those numbered rules. The [journal](https://github.com/iamaanahmad/awaaz-kit/blob/main/docs/kiro-journal.md) records where those checks changed the build.

Property-based tests found a real storage bug: a finalized bill item could be deleted. The fix added database delete guards. The exact counterexample and fix are recorded in `docs/kiro-journal.md`. The model benchmark measures lecture clips, not the Awaaz Kit voice flow on a phone. It does not prove working shop speech.

## Links and final checks

- Live apps: https://awaazkit.vercel.app/order/ and https://awaazkit.vercel.app/bill/
- Public source: https://github.com/iamaanahmad/awaaz-kit
- Public YouTube video: pending Amaan's replacement recording and link check. The prior typed demo was deleted at his request.
- Devpost receipt: none verified. Record the platform URL and submission time after entry.
- Confirm the entrant's sponsor and judge ties before submission.

The [official rules](https://kiroween.devpost.com/rules) close submissions December 4, 2026, at 2:00 pm Pacific Time. They require a public YouTube demo, working app links, public licensed GitHub source, a root `.kiro` folder, two app folders for Skeleton Crew, and this Kiro write-up. The video must match the working app.
