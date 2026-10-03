/**
 * Fake of the <ezp-printing> web component from ezeep-js. Only the methods and
 * properties the add-in uses are implemented. Every property write is recorded in
 * `ezp.writes`, so tests can assert on ordering (filename before filedata).
 */

export const AUTH_URI =
  "https://account.ezeep.com/oauth/authorize/?client_id=test&code_challenge=abc";

type Write = [property: string, value: unknown];

export const ezp = {
  authorized: false,
  checkAuth: jest.fn(),
  getAuthUri: jest.fn(),
  open: jest.fn(),
  logOut: jest.fn(),
  writes: [] as Write[],
  values: {} as Record<string, unknown>,
  /** Values written to one property, in order. */
  writesTo(property: string): unknown[] {
    return this.writes.filter(([p]) => p === property).map(([, v]) => v);
  },
  reset() {
    this.authorized = false;
    this.writes = [];
    this.values = {};
    this.checkAuth.mockReset().mockImplementation(async () => this.authorized);
    this.getAuthUri.mockReset().mockResolvedValue(AUTH_URI);
    this.open.mockReset().mockResolvedValue(undefined);
    this.logOut.mockReset().mockResolvedValue(undefined);
  },
};

const RECORDED_PROPERTIES = ["filename", "filedata", "code", "language"];

/** Registers the fake under the real tag name. Can only run once per test file (jsdom). */
export function defineFakeEzpPrinting() {
  class FakeEzpPrinting extends HTMLElement {
    checkAuth() {
      return ezp.checkAuth();
    }
    getAuthUri() {
      return ezp.getAuthUri();
    }
    open() {
      return ezp.open();
    }
    logOut() {
      return ezp.logOut();
    }
  }
  for (const property of RECORDED_PROPERTIES) {
    Object.defineProperty(FakeEzpPrinting.prototype, property, {
      configurable: true,
      get() {
        return ezp.values[property];
      },
      set(value: unknown) {
        ezp.writes.push([property, value]);
        ezp.values[property] = value;
      },
    });
  }
  customElements.define("ezp-printing", FakeEzpPrinting);
}
