# Awaaz Kit speech-model probe

This is an independent feasibility test, not part of the deployed Awaaz Kit apps. It runs Udgam Labs' official `shruti-onnx` package with the Hindi model and a local 16 kHz mono WAV file. It makes no claim that Awaaz Kit transcribes speech today.

```sh
npm install
npm run transcribe -- /path/to/16khz-mono.wav
```

The model downloads on first use. Audio stays local. The probe forces English recognition for English-only samples. A Hindi or Hinglish app test must use the matching language setting and actual shop speech.

November 25 check: the official `whisper.cpp` JFK sample produced `and so my fellow americans ask not what your country can do for you ask what you can do for your country`. Model load took 23.3 seconds; inference took 2.5 seconds for 11 seconds of speech on this container. A synthetic Flite shop order produced a wrong transcript. These two clips do not prove shop-order accuracy, microphone capture, browser speed, or an Awaaz Kit app integration.

Sources: [Shruti integration guide](https://github.com/udgamlabs/shruti/blob/main/onnx/docs/integrate.md), [Whisper sample](https://github.com/ggml-org/whisper.cpp/blob/master/samples/jfk.wav).
