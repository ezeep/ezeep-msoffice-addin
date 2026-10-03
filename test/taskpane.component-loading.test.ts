import en from "../src/locales/en.json";
import { defineFakeEzpPrinting, ezp } from "./helpers/ezpPrinting";
import { HostType, installOfficeMock, PlatformType } from "./helpers/office";
import {
  errorText,
  loadTaskpaneDom,
  loadTaskpaneModule,
  settle,
  visibleSections,
} from "./helpers/dom";

// The ezeep-js loader registers <ezp-printing> asynchronously, so Office.onReady can run
// before the element exists. These tests start with the element *not* defined.
// They depend on order: once defined, a custom element can't be undefined in jsdom.

const WORD_DESKTOP = { host: HostType.Word, platform: PlatformType.PC };

beforeEach(() => {
  ezp.reset();
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("ezeep-js component loading", () => {
  test("shows an error if <ezp-printing> never gets defined (15 s timeout)", async () => {
    jest.useFakeTimers();
    loadTaskpaneDom();
    const office = installOfficeMock();
    loadTaskpaneModule();

    const started = office.ready(WORD_DESKTOP);
    await jest.advanceTimersByTimeAsync(14999);
    expect(visibleSections()).toEqual(["#loading"]);

    await jest.advanceTimersByTimeAsync(1);
    await started;

    expect(visibleSections()).toEqual(["#errorSection"]);
    expect(errorText()).toBe(en.genericError);
    expect(ezp.checkAuth).not.toHaveBeenCalled();
  });

  test("waits for a late <ezp-printing> definition instead of throwing", async () => {
    loadTaskpaneDom();
    const office = installOfficeMock();
    loadTaskpaneModule();

    const started = office.ready(WORD_DESKTOP);
    await settle();
    // Office is ready, the component isn't: nothing may have been called yet.
    expect(ezp.checkAuth).not.toHaveBeenCalled();
    expect(visibleSections()).toEqual(["#loading"]);

    defineFakeEzpPrinting();
    await started;

    expect(ezp.checkAuth).toHaveBeenCalledTimes(1);
    expect(visibleSections()).toEqual(["#authSection"]);
  });
});
