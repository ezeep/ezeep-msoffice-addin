/* global window, Office, URL, URLSearchParams */

// This page serves both ends of the sign-in dialog:
//  1. Start page: the task pane opens it with ?authUri=..., because the first page an
//     Office dialog loads must be on the add-in's own domain. It forwards to the ezeep
//     login page.
//  2. Redirect target: ezeep sends the browser back here with ?code=... (or ?error=...),
//     and the result is posted to the task pane.

// Only forward to ezeep's own login hosts, so this page can't be used as an open redirect.
const ALLOWED_AUTH_HOSTS = ["account.ezeep.com", "account.tst.azdev.ezeep.com", "account.dev.azdev.ezeep.com"];

const params = new URLSearchParams(window.location.search);
const authUri = params.get("authUri");

if (authUri) {
  forwardToLogin(authUri);
} else {
  Office.onReady(() => {
    const code = params.get("code");
    const message = code ? { code } : { error: params.get("error") || "missing_code" };
    Office.context.ui.messageParent(JSON.stringify(message));
  });
}

function forwardToLogin(uri: string) {
  let target: URL;
  try {
    target = new URL(uri);
  } catch {
    return;
  }
  if (target.protocol === "https:" && ALLOWED_AUTH_HOSTS.indexOf(target.hostname) > -1) {
    window.location.replace(target.toString());
  }
}
