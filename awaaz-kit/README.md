# Awaaz Kit · Kiroween entry package

Awaaz Kit is a two-app starter kit for small shops. [Order Awaaz](https://awaazkit.vercel.app/order/) builds checked orders. [Bill Awaaz](https://awaazkit.vercel.app/bill/) builds checked cash memos.

- [Project source, license, and Kiro files](https://github.com/iamaanahmad/awaaz-kit)
- [Checked 72.9-second typed demo](https://youtu.be/wPdiOcr6eKI)
- [Project description and Kiro write-up](./devpost-entry.md)
- [Checked speech-model feasibility probe](./voice-model-probe/README.md)
- [Kiroween 2026 rules](https://kiroween.devpost.com/rules)

## Judge walkthrough

1. Open [Order Awaaz](https://awaazkit.vercel.app/order/) and choose a labelled sample or type a shopping request. Review the matched items and confirm the order.
2. Open [Bill Awaaz](https://awaazkit.vercel.app/bill/) and choose a labelled sample or type a bill request. Review the lines and total before saving the cash memo.
3. Watch the [checked typed demo](https://youtu.be/wPdiOcr6eKI). It shows the two working flows in 72.9 seconds.
4. Inspect the [Kiro specification](https://github.com/iamaanahmad/awaaz-kit/tree/main/.kiro/specs/awaaz-kit), [steering and hooks](https://github.com/iamaanahmad/awaaz-kit/tree/main/.kiro), and [development journal](https://github.com/iamaanahmad/awaaz-kit/blob/main/docs/kiro-journal.md) to see how the two apps were built and checked.

The public demo shows typed input. The current live provider does not transcribe speech. Real voice capture remains unverified.

This folder is the entry-copy package. The application source lives in the linked Awaaz Kit repository. No Devpost submission receipt is claimed here.
