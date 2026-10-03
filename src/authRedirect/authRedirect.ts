/* global window, Office, URL, URLSearchParams */

// This page serves both ends of the sign-in dialog:
//  1. Start page: the task pane opens it with ?authUri=..., because the first page an
//     Office dialog loads must be on the add-in's own domain. It forwards to the ezeep
//     login page.
//  2. Redirect target: ezeep sends the browser back here with ?code=... (or ?error=...),
//     and the result is posted to the task pane as JSON.

// Only forward to ezeep's own login hosts, so this page can't be used as an open redirect.
export const ALLOWED_AUTH_HOSTS = ["account.ezeep.com", "account.tst.azdev.ezeep.com", "account.dev.azdev.ezeep.com"];

export function isAllowedAuthUri(uri: string): boolean {
  try {
    const target = new URL(uri);
    return target.protocol === "https:" && ALLOWED_AUTH_HOSTS.indexOf(target.hostname) > -1;
  } catch {
    return false;
  }
}

/** Message posted to the task pane: {"code": ...} or {"error": ...}. */
export function resultMessage(params: URLSearchParams): string {
  const code = params.get("code");
  return JSON.stringify(code ? { code } : { error: params.get("error") || "missing_code" });
}

export function handleAuthRedirect(search: string, navigate: (url: string) => void) {
  const params = new URLSearchParams(search);
  const authUri = params.get("authUri");

  if (authUri !== null) {
    if (isAllowedAuthUri(authUri)) {
      navigate(authUri);
    }
    return;
  }

  Office.onReady(() => {
    Office.context.ui.messageParent(resultMessage(params));
  });
}

handleAuthRedirect(window.location.search, (url) => window.location.replace(url));
