# Awaaz Kit · Kiroween entry package

Awaaz Kit is a two-app starter kit for small shops. [Order Awaaz](https://awaazkit.vercel.app/order/) builds checked orders. [Bill Awaaz](https://awaazkit.vercel.app/bill/) builds checked cash memos.

- [Project source, license, and Kiro files](https://github.com/iamaanahmad/awaaz-kit)
- Public demo: pending Amaan's replacement recording and link check.
- [Replacement demo recording guide](./demo-recording-guide.md)
- [Project description and Kiro write-up](./devpost-entry.md)
- [Checked speech-model feasibility probe](./voice-model-probe/README.md)
- [Bill app synthetic-audio check](./evidence/bill-synthetic-audio-20261127.png) (desktop fake microphone; no human speech)
- [Order app recorded-speech check](./evidence/order-lecture-audio-20261127.png) (human Hinglish lecture clip; three false order items)
- [Bill app recorded-speech check](./evidence/bill-lecture-audio-20261127.png) (same clip; three false bill lines)
- [Kiroween 2026 rules](https://kiroween.devpost.com/rules)

## Judge walkthrough

1. Open [Order Awaaz](https://awaazkit.vercel.app/order/) and choose a labelled sample or type a shopping request. Review the matched items and confirm the order.
2. Open [Bill Awaaz](https://awaazkit.vercel.app/bill/) and choose a labelled sample or type a bill request. Review the lines and total before saving the cash memo.
3. Watch the replacement public demo after Amaan records it and its link is checked. Until then, use the two live apps above.
4. Inspect the [Kiro specification](https://github.com/iamaanahmad/awaaz-kit/tree/main/.kiro/specs/awaaz-kit), [steering and hooks](https://github.com/iamaanahmad/awaaz-kit/tree/main/.kiro), and [development journal](https://github.com/iamaanahmad/awaaz-kit/blob/main/docs/kiro-journal.md) to see how the two apps were built and checked.

The typed flows work in the live apps. November 27 desktop checks fed one synthetic English clip through each live app's microphone path. Order Awaaz transcribed it and found two items. Bill Awaaz transcribed it and found two lines. A separate live-browser check played one recorded human Hinglish lecture clip through Order Awaaz's microphone path. It produced a transcript, but the order parser also found three items in the unrelated lecture. Bill Awaaz also transcribed the same clip and found three false bill lines. These are false matches, not valid shop requests. Real human shop speech, Hindi or Hinglish shop accuracy, and phone performance remain unverified.

This folder is the entry-copy package. The application source lives in the linked Awaaz Kit repository. No Devpost submission receipt is claimed here.
