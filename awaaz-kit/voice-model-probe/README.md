# Awaaz Kit speech-model probe

This is an independent feasibility test, not part of the deployed Awaaz Kit apps. It runs Udgam Labs' official `shruti-onnx` package with the Hindi model. It makes no claim that Awaaz Kit transcribes speech today.

```sh
npm install
npm run transcribe -- /path/to/phone-recording.m4a --language hi --expected "spoken shop order"
```

Install `ffmpeg` first. The command accepts phone recordings, including M4A, MP3, and WAV. It converts audio to 16 kHz mono in memory and does not save a converted copy. The model downloads on first use. Audio stays local. Use `--language en` for English-only speech, `--language hi` for Hindi, or `--language auto` for mixed speech. The optional `--expected` text reports word error rate, where 0 means an exact word match. Use a real recorded shop request to measure the product case; the supplied English sample is only a runtime check.

November 25 check: the official `whisper.cpp` JFK sample produced `and so my fellow americans ask not what your country can do for you ask what you can do for your country`. Model load took 23.3 seconds; inference took 2.5 seconds for 11 seconds of speech on this container. A synthetic Flite shop order produced a wrong transcript. These two clips do not prove shop-order accuracy, microphone capture, browser speed, or an Awaaz Kit app integration.

November 26 check: the same English sample scored 0 word error rate with `--language en`. The score code and language choice now make recorded Hindi or Hinglish shop clips measurable. No real shop recording was available in this runtime.

Sources: [Shruti integration guide](https://github.com/udgamlabs/shruti/blob/main/onnx/docs/integrate.md), [Whisper sample](https://github.com/ggml-org/whisper.cpp/blob/master/samples/jfk.wav).
