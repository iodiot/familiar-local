# Familiar Local

A lightweight chat interface for Apple's on-device Foundation Models. Familiar runs on your Mac and keeps the web interface and local server on `127.0.0.1`.

## Download for macOS

[Download Familiar for macOS](https://github.com/iodiot/familiar-local/raw/refs/heads/main/downloads/Familiar-macOS.zip) · ZIP archive

Unzip the download and move `Familiar.app` to Applications. This build is ad-hoc signed and not notarized, so macOS may ask you to Control-click the app and choose **Open** the first time you launch it.

Requires macOS 26 or later, a supported Mac, and Apple Intelligence with its model ready.

## Screenshots

### Light mode

![Familiar Local in light mode](screenshots/light.jpg)

### Dark mode

![Familiar Local in dark mode](screenshots/dark.jpg)

## What it does

- Runs prompts through Apple's `SystemLanguageModel` with `LanguageModelSession`
- Keeps separate conversations with their own model context
- Saves chat history in your browser's local storage
- Offers light and dark themes
- Includes an optional macOS app wrapper that starts and stops the local server for you

## Run from source

```sh
swift run apple-fm-chat
```

Open <http://127.0.0.1:8787> in your browser. Stop the server with `Ctrl+C` in Terminal.

## Build the macOS app

```sh
./scripts/package-app.sh
```

This creates `outputs/Familiar.app` and `outputs/Familiar-macOS.zip`. The generated bundle is ad-hoc signed for local testing. To distribute a notarized app, sign it with a Developer ID certificate and notarize it with Apple.

## Privacy

The server listens only on the loopback address `127.0.0.1`. Prompts are sent to Apple's on-device model; this app does not send them to a hosted AI service. Chat history is stored locally in the browser. Model context lives in server memory and resets when the server stops.

## License

MIT. See [LICENSE](LICENSE).
