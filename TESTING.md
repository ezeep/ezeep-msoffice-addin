# Testing the ezeep Blue Office add-in

The add-in is tested on two levels:

| Level | What it proves | Runs where |
|---|---|---|
| **Automated tests** (Jest + jsdom) | The task pane logic and the sign-in redirect page behave correctly against a fake Office.js and a fake `<ezp-printing>` | Locally and in CI on every pull request |
| **Manual end-to-end test** | The add-in works in real Word/Excel with real ezeep-js, real sign-in and a real print job | A developer machine with Office |

The automated tests can't replace the manual test before a release (see [Limits](#limits-of-the-automated-tests)).

---

## 1. Automated tests

### Running them

```bash
npm ci
npm test                 # all tests
npm run test:coverage    # with coverage report (text + coverage/lcov-report/index.html)
npm run typecheck        # app and test code
npm run lint
```

`npx jest test/authRedirect.test.ts` runs one file; `npx jest -t "sign-in"` runs tests whose name matches.

### CI

`.github/workflows/test.yml` runs lint, type check, tests with coverage and the production build on every pull request, on Node 18 like the release build. The coverage report is attached to the run as an artifact.

This workflow never deploys. `node.js.yml` (build, release, CDN upload) still only runs on push to `main`.

### How the test harness works

```
test/
├── helpers/
│   ├── office.ts         Fake Office.js + Excel.run (Office, Excel globals)
│   ├── ezpPrinting.ts    Fake <ezp-printing> custom element
│   └── dom.ts            Loads taskpane.html, loads the module, small DOM helpers
├── taskpane.test.ts                     Task pane flow
├── taskpane.component-loading.test.ts   <ezp-printing> defined late / never
├── authRedirect.test.ts                 Dialog start page and redirect target
└── tsconfig.json                        Type-check settings for tests
```

- **Real markup.** Each test puts the `<body>` of `src/taskpane/taskpane.html` into jsdom, so element IDs and sections are the ones that ship.
- **Fresh module per test.** `loadTaskpaneModule()` loads `src/taskpane/taskpane.ts` with `jest.isolateModules`. Each test gets new module state and a new `Office.onReady` registration. `office.ready({ host, platform })` then runs that callback and waits for it to finish.
- **Fake Office.js (`installOfficeMock(options)`).**
  - Callbacks arrive asynchronously, like the real API, so ordering bugs still show up.
  - Options control the scenario: PDF bytes and slice size, failing `getFileAsync` or a failing slice, file URL, dialog failure code, Excel used range and display language.
  - The returned object exposes the `jest.fn()`s (`getFileAsync`, `getSliceAsync`, `closeAsync`, `displayDialogAsync`, `messageParent`, `dialog.close`). `dialog.fire(eventType, arg)` delivers dialog messages and events.
- **Fake `<ezp-printing>`.**
  - Implements only what the add-in uses: `checkAuth`, `getAuthUri`, `open`, `logOut`, and the properties `filename`, `filedata`, `code`, `language`.
  - Every property write is recorded in `ezp.writes`, so tests can assert on order. For example, `filename` must be set before `filedata`, because ezeep-js builds the `File` in its `filedata` watcher.
  - `ezp.authorized` controls what `checkAuth()` returns.
- **jsdom URL.** The URL is `https://localhost:3000/taskpane.html` (see `jest.config.js`), the same origin as the dev server, so relative URLs such as `authRedirect.html` resolve like in Office.
- **Separate Babel setup.** Tests compile with `@babel/preset-env` for the current Node version, configured inline in `jest.config.js`. The webpack build doesn't use this setup and is unaffected.

### What is covered

| Area | Tests check that … | Related |
|---|---|---|
| Start-up | signed out → sign-in screen; signed in → PDF exported, ezeep printing opened, spinner gone; display language passed on | #24 |
| Component loading | the add-in waits for a late `<ezp-printing>` definition instead of throwing; shows an error after 15 s if it never loads | #24 |
| PDF export | all slices read in order; file closed exactly once, after the last slice; 9 MB document over three 4 MB slices; bytes > 127 intact | #24 |
| Errors | `getFileAsync` failure, failing slice, exception during start-up, export failure on reprint → error message, never an endless spinner | #24 |
| Platforms | Word on the web → explanation, no export attempt; Excel on the web exports; PowerPoint → explanation; legacy Edge/IE → upgrade notice | #17 |
| Excel | empty active sheet → "no data" message | |
| File name | local path, SharePoint URL (decoded, query string removed), generated name for unsaved documents | |
| Printing again | after `printFinished`, Print exports again; `filedata` reset so ezeep-js's watcher fires for an unchanged document | |
| Sign-in dialog | opens `authRedirect.html` on the add-in domain with `authUri`; sizes 60/30 %; code → signed in and printing; single-use code cleared after `authSuccess`; error or non-JSON message → sign-in failed; dialog closed by user (12006) → stays on sign-in; dialog can't open → error | |
| Redirect page | forwards only to `https://account*.ezeep.com` (open-redirect guard incl. look-alike hosts, userinfo trick, `javascript:`); posts `{code}` / `{error}` / `missing_code` | |
| Log out | calls ezeep-js `logOut()` and returns to sign-in | |
| Localisation | German Office → German texts | |

The tests were checked against the old code on `main`: 29 of the 30 task pane tests fail there. Each key fix was also reverted one at a time, and every reversion made at least one test fail: the `whenDefined` wait, `filename` before `filedata`, the `filedata` reset, and the dialog status check.

### Writing a new test

```ts
test("signed in Word desktop opens ezeep printing", async () => {
  ezp.authorized = true;                                    // what checkAuth() returns
  await startTaskpane(WORD_DESKTOP, { fileUrl: "C:\\x\\Report.docx" });

  expect(visibleSections()).toEqual(["#printingSection"]);
  expect(ezp.open).toHaveBeenCalledTimes(1);
});
```

- For button clicks, call `click("#printBtn")` and then `await settle()`. Click handlers aren't awaited by the add-in, so `settle()` lets their promise chains finish.
- Compare user-facing texts with `src/locales/en.json`, not with copied strings.
- If you add a new ezeep-js method or property to the add-in, add it to the fake in `test/helpers/ezpPrinting.ts`. Otherwise the test fails with "is not a function", which is intended.

### Limits of the automated tests

They don't exercise:

- **Real Office behaviour**: the WebView2/WKWebView runtime, actual `getFileAsync` output, the dialog window, popup blockers, Office on the web iframes and storage partitioning.
- **Real ezeep-js**: the CDN build, `open()` showing the extra sign-in step (#18), printer selection UI, token refresh. The fake only mirrors the API surface, so a behaviour change in ezeep-js won't show up here (#19).
- **The ezeep auth server**: redirect URI registration, PKCE exchange.
- **The manifest**: validation, ribbon button, icons, requirement sets (#20).
- **`commands.ts`**: only an `Office.onReady` stub; not tested.

That is what the manual test below is for.

---

## 2. Manual end-to-end test

### Prerequisites

- Node.js 18+ and `npm ci` in a checkout of the branch under test.
- Trusted dev certificates for `https://localhost:3000`: `npx office-addin-dev-certs install`. On first use this asks to trust a local CA.
- Word and Excel desktop (Windows and/or Mac) and a Microsoft 365 account for Office on the web.
- An ezeep Blue **test account** and a **test or virtual printer**, so test prints don't go to a real printer.
- The task pane uses the production ezeep client ID (`clientid` in `src/taskpane/taskpane.html`). To test against the ezeep test environment, temporarily switch to the TST client ID and set `authapihosturl`/`printapihosturl` (values are in the comment above `<ezp-printing>`). Don't commit that change.

### Starting the add-in

| Target | Command / steps |
|---|---|
| Word desktop | `npm run start:desktop` (default app is Word, see `config.app_to_debug` in `package.json`) |
| Excel desktop | `npx office-addin-debugging start manifest.xml desktop --app excel` |
| Office on the web | `npm run dev-server`, then in Word/Excel on the web: **Home → Add-ins → More add-ins → My add-ins → Upload My Add-in** and choose `manifest.xml` |
| Stop / unregister | `npm stop` |

The ribbon button is **Home → Print → ezeep Blue**.

### Debugging

- **Windows**: right-click inside the task pane and choose **Inspect** to open Edge DevTools for the add-in. See [Debug add-ins using developer tools in Microsoft Edge](https://learn.microsoft.com/office/dev/add-ins/testing/debug-add-ins-using-devtools-edge-chromium).
- **Mac**: enable the Web Inspector once per app, then right-click the task pane → **Inspect Element**. See [Debug Office Add-ins on a Mac](https://learn.microsoft.com/office/dev/add-ins/testing/debug-office-add-ins-on-ipad-and-mac).
  ```bash
  defaults write com.microsoft.Word OfficeWebAddinDeveloperExtras -bool true
  defaults write com.microsoft.Excel OfficeWebAddinDeveloperExtras -bool true
  ```
- **Office on the web**: use the browser's DevTools and select the add-in's iframe.
- **Stale code after a change**: clear the Office add-in cache. See [Clear the Office cache](https://learn.microsoft.com/office/dev/add-ins/testing/clear-cache).

Errors that used to leave the spinner up are now logged to the console *and* shown in the task pane.

### Test matrix

Mark each cell ✅ / ❌ / n/a and note the Office build (**File → Account → About**).

| # | Test case | Expected result | Word Win | Word Mac | Word web | Excel Win | Excel Mac | Excel web |
|---|---|---|---|---|---|---|---|---|
| 1 | Open the task pane, signed out | Sign-in screen; no endless spinner | | | | | | |
| 2 | Log In → complete ezeep login | Dialog opens (Office may first ask to allow it), closes by itself; ezeep printing opens | | | | | | |
| 3 | Close the login dialog without signing in | Stays on sign-in screen; Log In works again | | | | | | |
| 4 | Print to the test printer | Job arrives with the correct document name and content | | | | | | |
| 5 | Print again without changes | Print button shown after the first job; second job identical | | | | | | |
| 6 | Close and reopen the task pane | Still signed in; goes straight to ezeep printing | | | | | | |
| 7 | Document > 4 MB (e.g. with large images) | Prints completely | | | | | | |
| 8 | New, unsaved document | Job name `Word-<date>.pdf` / `Excel-<date>.pdf` | | | | | | |
| 9 | Excel: empty active sheet | "No data in sheet" message | n/a | n/a | n/a | | | |
| 10 | Log Out | Back to sign-in screen; reopening the pane asks for sign-in | | | | | | |
| 11 | German Office UI | Texts in German | | | | | | |
| 12 | Word on the web | Message to use Word desktop; no spinner | n/a | n/a | | n/a | n/a | n/a |

Known behaviour, not a failure: after sign-in, ezeep-js shows its own "Sign in" card before printer selection (#18).

### Recording the result

Paste the filled-in matrix into the pull request. Note any failure with the Office build, platform and the console output.
