# Phase 2: a native iPhone app (plan only, not started)

> Nothing here is built yet. Start only when you say go.

## Goal

A real iPhone app (React Native, with Expo and TypeScript) that looks and works like the web app. It reuses the money logic in `app/src/core` **unchanged**, keeps data only on the phone, and never needs a Mac.

## What's free and what needs the paid Apple Developer Program

The paid program costs US$99 a year, about A$149 in Australia.

| Step | Free | Needs paid Apple account |
| --- | --- | --- |
| Expo account, EAS (Expo's cloud build service) account | ✅ | |
| Running the app on your iPhone inside **Expo Go** (free App Store app), served from `npx expo start` on your PC, same Wi-Fi or `--tunnel` | ✅ | |
| Android builds (APK) from EAS | ✅ | |
| A **development build** on your iPhone (needed for any native module that isn't in Expo Go, e.g. MMKV or a custom PDF reader) | | ✅ |
| Installing a built app on your iPhone (ad-hoc / "internal distribution") | | ✅ |
| TestFlight | | ✅ |
| App Store | | ✅ (plus Apple's review) |

Why there's no free way to install your own build:

- Apple's free "personal team" signing only works from Xcode, which only runs on a Mac.
- EAS needs a paid account to sign iOS builds for a real device.

So without paying, the native app only runs **inside Expo Go while your PC is serving it**. That's great for building and testing. For day-to-day use, the web app from Phase 1 stays your installed app until you decide to pay.

No Mac is needed at any point. EAS builds iOS apps in the cloud, and `eas submit` uploads to TestFlight/App Store from Linux.

EAS's free tier includes a limited number of builds per month. Check expo.dev/pricing before relying on a number.

## Reusing the logic

- An Expo project goes in `native/` in this same repo. It imports `app/src/core/index.js` directly, using Metro `watchFolders` so the bundler can see the folder.
- Core is plain JavaScript with JSDoc types and `// @ts-check`. TypeScript reads those types with `allowJs`, so core doesn't get rewritten.
- `npm run typecheck` already keeps those types honest.
- Core uses `Intl` for en-AU money and dates. React Native's engine (Hermes) supports `Intl`. **Check this first**: `money(-1240)` must show `−$1,240` in Expo Go.
- `ui/advice.js` (suggestion wording) builds HTML strings. It gets re-done as React components, using the same conditions. `core/investing.js` stays the single home for investing wording.

## Storage

**Use `expo-sqlite`'s key-value store** (`expo-sqlite/kv-store`): one key, `"stack-v4"`, holding the same JSON text as the web app.

- It works inside Expo Go, so it's free to test.
- **MMKV** is faster, but it needs a development build, which means the paid account. Not worth it for one small JSON record.

Moving your data across: in the web app, Plan → Data → **Export**. In the native app, **Import**. The shape is identical, so nothing gets converted.

Ground rules: local only. No backend, no accounts, no analytics, never ask for bank logins.

## PDF statements: the hard part

`readPdfStatement` (in core) needs every piece of text **with its x/y position**. That's how it tells Debit, Credit and Balance columns apart. iOS has no built-in way to get that from JavaScript.

| | **pdf.js in a hidden WebView** (recommended) | **Native text extraction** (Swift + Apple's PDFKit, as a custom Expo module) |
| --- | --- | --- |
| Works in Expo Go (free) | ✅ `react-native-webview` is included | ❌ needs a development build, so the paid account |
| Same results as the web app | ✅ same pdf.js 3.11.174 and same `pdfTextLines`, so `readPdfStatement` gets identical input | ⚠️ PDFKit splits text into different pieces, so the column logic would need re-tuning and new tests |
| Effort | Small: an HTML page with pdf.js inlined, then message passing | Large: write Swift without a Mac, debug only through cloud builds |
| Speed / memory | Slower; the PDF crosses into the WebView as base64 (about 1.33× its size). Fine for statements, which are a few MB at most | Faster |
| Offline | ✅ pdf.js bundled inside the app | ✅ |

How the WebView route works:

1. `expo-document-picker` picks the PDF, and `expo-file-system` reads it as base64.
2. A hidden `<WebView>` holds a tiny HTML page with pdf.js inlined, loaded from the app bundle with no network. It's created with `isEvalSupported: false`, same as now.
3. The app sends the base64 in. The page runs `pdfTextLines` and posts the lines back as JSON.
4. The app runs `readPdfStatement(lines)` from core, then the same review screen and "Check your balances" step as the web app.

CSV files need none of this. `readStatement` runs directly.

## Other packages (all available in Expo Go)

- `expo-document-picker` and `expo-file-system`: choosing statements.
- `expo-clipboard`: Export / Import.
- `react-native-svg`: the stacked-layers picture and the FI chart.
- `expo-font`: Archivo and IBM Plex. React Native can't use Archivo's width axis, so use the static **Archivo Expanded** ExtraBold/Black files.
- `useColorScheme`: light and dark, with the same colour tokens as `styles.css`.

## Rough order when you say go

1. `npx create-expo-app native --template` (TypeScript). Open it in Expo Go and get a blank screen on your phone.
2. Import core and show the countdown for the sample data. This proves the logic reuse and `Intl` on Hermes.
3. Storage (`kv-store`) and Import from the web app's Export.
4. The screens, one tab at a time, copying the web app's look.
5. CSV import, then the PDF WebView.
6. Decide on the paid account. If yes, `eas build` (cloud) and TestFlight.
