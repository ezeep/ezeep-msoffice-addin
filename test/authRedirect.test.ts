/* global describe, test, expect, beforeEach, jest, URLSearchParams */

import { installOfficeMock, OfficeMock } from "./helpers/office";

let office: OfficeMock;
let authRedirect: typeof import("../src/authRedirect/authRedirect");

beforeEach(() => {
  office = installOfficeMock();
  // Importing the module also runs it once for the jsdom URL (no query string): harmless.
  jest.isolateModules(() => {
    authRedirect = require("../src/authRedirect/authRedirect");
  });
});

describe("isAllowedAuthUri (open-redirect guard)", () => {
  test.each([
    "https://account.ezeep.com/oauth/authorize/?client_id=x",
    "https://account.tst.azdev.ezeep.com/oauth/authorize/",
    "https://account.dev.azdev.ezeep.com/oauth/authorize/",
  ])("allows %s", (uri) => {
    expect(authRedirect.isAllowedAuthUri(uri)).toBe(true);
  });

  test.each([
    ["plain http", "http://account.ezeep.com/oauth/authorize/"],
    ["foreign host", "https://evil.example.com/oauth/authorize/"],
    ["look-alike suffix", "https://account.ezeep.com.evil.example.com/"],
    ["look-alike prefix", "https://evilaccount.ezeep.com/"],
    ["userinfo trick", "https://account.ezeep.com@evil.example.com/"],
    ["javascript URL", "javascript:alert(1)"],
    ["relative URL", "/oauth/authorize/"],
    ["empty", ""],
  ])("rejects %s", (_label, uri) => {
    expect(authRedirect.isAllowedAuthUri(uri)).toBe(false);
  });
});

describe("start page (?authUri=...)", () => {
  test("forwards to an allowed ezeep login URL", () => {
    const navigate = jest.fn();
    const target = "https://account.ezeep.com/oauth/authorize/?client_id=x&state=y";

    authRedirect.handleAuthRedirect(`?authUri=${encodeURIComponent(target)}`, navigate);

    expect(navigate).toHaveBeenCalledWith(target);
  });

  test("does not forward anywhere else", () => {
    const navigate = jest.fn();

    authRedirect.handleAuthRedirect(`?authUri=${encodeURIComponent("https://evil.example.com/")}`, navigate);

    expect(navigate).not.toHaveBeenCalled();
    expect(office.messageParent).not.toHaveBeenCalled();
  });
});

describe("redirect target (?code=... / ?error=...)", () => {
  async function runRedirect(search: string) {
    office.Office.onReady.mockClear();
    authRedirect.handleAuthRedirect(search, jest.fn());
    const callback = office.Office.onReady.mock.calls[0][0];
    await callback({});
  }

  test("posts the code to the task pane as JSON", async () => {
    await runRedirect("?code=abc123&state=xyz");

    expect(office.messageParent).toHaveBeenCalledWith(JSON.stringify({ code: "abc123" }));
  });

  test("posts the OAuth error if sign-in was denied", async () => {
    await runRedirect("?error=access_denied");

    expect(office.messageParent).toHaveBeenCalledWith(JSON.stringify({ error: "access_denied" }));
  });

  test("posts missing_code if neither is present", async () => {
    await runRedirect("");

    expect(office.messageParent).toHaveBeenCalledWith(JSON.stringify({ error: "missing_code" }));
  });

  test("resultMessage matches what the task pane parses", () => {
    expect(JSON.parse(authRedirect.resultMessage(new URLSearchParams("code=c1")))).toEqual({ code: "c1" });
  });
});
