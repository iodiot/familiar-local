# Familiar Local

A lightweight chat interface for Apple's on-device Foundation Models. Familiar runs on your Mac and keeps the local server bound to `127.0.0.1`.

## Download the macOS app

[Download Familiar for macOS](https://github.com/iodiot/familiar-local/raw/refs/heads/main/downloads/Familiar-macOS.zip) · ZIP archive

1. Unzip the download.
2. Move `Familiar.app` to Applications and open it.
3. Familiar starts its local server and opens the chat in its own window.

You can also open <http://127.0.0.1:8787> in Safari or another browser while Familiar is running. The app and browser use the same local service. Quit Familiar when you are done.

This build is ad-hoc signed and not notarized. On first launch, macOS may require you to Control-click `Familiar.app` and choose **Open**.

## Run in a browser from source

If you prefer not to use the packaged app, run the server directly from this source folder:

```sh
swift run apple-fm-chat
```

Then open <http://127.0.0.1:8787> in a browser on the same Mac. Keep the Terminal process running while chatting; stop it with `Ctrl+C`.

## Requirements

- A Mac running macOS 26 or later with Swift 6.2+
- Apple Intelligence enabled and its model downloaded and ready
- A supported Mac and prompt language

## Screenshots

### Light mode

![Familiar Local in light mode](screenshots/light.jpg)

### Dark mode

![Familiar Local in dark mode](screenshots/dark.jpg)

## Features

- Chats powered by Apple's `SystemLanguageModel` and `LanguageModelSession`
- Separate conversations, each with its own model context
- Chat history saved in browser local storage
- Light and dark themes
- A native macOS wrapper that starts and stops the local server automatically

## Build the macOS app

To package the app yourself, run:

```sh
./scripts/package-app.sh
```

This creates `outputs/Familiar.app` and `outputs/Familiar-macOS.zip`. To distribute a notarized app, sign it with a Developer ID certificate and notarize it with Apple.

## Privacy

The server listens only on the loopback address `127.0.0.1`, so it is accessible from this Mac and not exposed on your local network. Prompts are processed by Apple's on-device model; the app does not send them to a hosted AI service. Chat history is stored locally in the browser. Model context lives in server memory and resets when the server stops.

## License

MIT. See [LICENSE](LICENSE).
