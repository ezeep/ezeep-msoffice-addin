import en from "../src/locales/en.json";
import { AUTH_URI, defineFakeEzpPrinting, ezp } from "./helpers/ezpPrinting";
import {
  HostType,
  installOfficeMock,
  OfficeMock,
  OfficeMockOptions,
  PlatformType,
} from "./helpers/office";
import {
  binaryString,
  click,
  errorText,
  isVisible,
  loadTaskpaneDom,
  loadTaskpaneModule,
  settle,
  visibleSections,
} from "./helpers/dom";

const WORD_DESKTOP = { host: HostType.Word, platform: PlatformType.PC };

let office: OfficeMock;

/** Builds the task pane, loads taskpane.ts and runs Office.onReady for the given host. */
async function startTaskpane(info = WORD_DESKTOP, options: OfficeMockOptions = {}) {
  loadTaskpaneDom();
  office = installOfficeMock(options);
  loadTaskpaneModule();
  await office.ready(info);
}

beforeAll(() => defineFakeEzpPrinting());

beforeEach(() => {
  ezp.reset();
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe("start-up", () => {
  test("signed out: shows the sign-in section and doesn't export the document", async () => {
    await startTaskpane();

    expect(visibleSections()).toEqual(["#authSection"]);
    expect(office.getFileAsync).not.toHaveBeenCalled();
    expect(ezp.open).not.toHaveBeenCalled();
  });

  test("signed in: exports the PDF and opens ezeep printing, spinner hidden", async () => {
    ezp.authorized = true;
    await startTaskpane(WORD_DESKTOP, { fileUrl: "C:\\Users\\bernd\\Documents\\Report.docx" });

    expect(visibleSections()).toEqual(["#printingSection"]);
    expect(office.getFileAsync).toHaveBeenCalledWith(
      "pdf",
      { sliceSize: 4194304 },
      expect.any(Function)
    );
    expect(ezp.values.filename).toBe("Report.docx");
    expect(ezp.open).toHaveBeenCalledTimes(1);
  });

  test("passes the Office display language to ezp-printing", async () => {
    await startTaskpane(WORD_DESKTOP, { displayLanguage: "de-DE" });

    expect(ezp.values.language).toBe("de");
  });

  test("Excel with an empty active sheet shows the no-data message", async () => {
    ezp.authorized = true;
    await startTaskpane(
      { host: HostType.Excel, platform: PlatformType.PC },
      { excelUsedRange: { address: "Sheet1!A1", values: [[""]] } }
    );

    expect(visibleSections()).toEqual(["#noDataSection"]);
    expect(office.getFileAsync).not.toHaveBeenCalled();
  });

  test("Excel on the web with data exports the PDF (Pdf is supported there)", async () => {
    ezp.authorized = true;
    await startTaskpane({ host: HostType.Excel, platform: PlatformType.OfficeOnline });

    expect(office.getFileAsync).toHaveBeenCalled();
    expect(visibleSections()).toEqual(["#printingSection"]);
  });

  test("Word on the web shows an explanation instead of trying to export", async () => {
    ezp.authorized = true;
    await startTaskpane({ host: HostType.Word, platform: PlatformType.OfficeOnline });

    expect(visibleSections()).toEqual(["#errorSection"]);
    expect(errorText()).toBe(en.unsupportedWordOnline);
    expect(office.getFileAsync).not.toHaveBeenCalled();
  });

  test("hosts other than Word and Excel show an explanation", async () => {
    await startTaskpane({ host: HostType.PowerPoint, platform: PlatformType.PC });

    expect(visibleSections()).toEqual(["#errorSection"]);
    expect(errorText()).toBe(en.unsupportedHost);
  });

  test("legacy Edge / IE webviews show the upgrade notice", async () => {
    jest
      .spyOn(navigator, "userAgent", "get")
      .mockReturnValue(
        "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/70.0 Safari/537.36 Edge/18.19041"
      );
    await startTaskpane();

    expect(visibleSections()).toEqual(["#iesection"]);
    expect(ezp.checkAuth).not.toHaveBeenCalled();
  });

  test("an exception during start-up shows an error instead of the spinner", async () => {
    ezp.checkAuth.mockRejectedValue(new Error("network down"));
    await startTaskpane();

    expect(visibleSections()).toEqual(["#errorSection"]);
    expect(errorText()).toBe(en.genericError);
  });
});

describe("PDF export (getFileAsync)", () => {
  test("reads every slice in order and closes the file exactly once", async () => {
    ezp.authorized = true;
    const pdf = Uint8Array.from({ length: 11 }, (_, i) => (i * 37 + 200) % 256); // includes bytes > 127
    await startTaskpane(WORD_DESKTOP, { pdf, sliceSize: 4 });

    expect(office.getSliceAsync.mock.calls.map(([index]) => index)).toEqual([0, 1, 2]);
    expect(office.closeAsync).toHaveBeenCalledTimes(1);
    expect(ezp.values.filedata).toBe(binaryString(pdf));
  });

  test("does not close the file before all slices are read", async () => {
    ezp.authorized = true;
    await startTaskpane(WORD_DESKTOP, { pdf: new Uint8Array(10), sliceSize: 3 });

    const lastSliceRequest = Math.max(...office.getSliceAsync.mock.invocationCallOrder);
    const close = office.closeAsync.mock.invocationCallOrder[0];
    expect(close).toBeGreaterThan(lastSliceRequest);
  });

  test("handles a large document (several 4 MB slices) without stack or argument overflows", async () => {
    ezp.authorized = true;
    const pdf = new Uint8Array(9 * 1024 * 1024).map((_, i) => i % 251);
    await startTaskpane(WORD_DESKTOP, { pdf, sliceSize: 4194304 });

    expect(office.getSliceAsync).toHaveBeenCalledTimes(3);
    expect((ezp.values.filedata as string).length).toBe(pdf.length);
    expect((ezp.values.filedata as string).charCodeAt(pdf.length - 1)).toBe(pdf[pdf.length - 1]);
  });

  test("sets filename before filedata, as ezp-printing builds the File in its filedata watcher", async () => {
    ezp.authorized = true;
    await startTaskpane();

    const order = ezp.writes
      .map(([property]) => property)
      .filter((p) => p === "filename" || p === "filedata");
    expect(order[0]).toBe("filename");
  });

  test("generates a filename for unsaved documents", async () => {
    ezp.authorized = true;
    await startTaskpane(WORD_DESKTOP, { fileUrl: "" });

    expect(ezp.values.filename).toMatch(/^Word-.+\.pdf$/);
  });

  test("takes the file name from a web URL", async () => {
    ezp.authorized = true;
    await startTaskpane(
      { host: HostType.Excel, platform: PlatformType.OfficeOnline },
      {
        fileUrl: "https://contoso.sharepoint.com/sites/x/Shared%20Documents/Q3%20Budget.xlsx?web=1",
      }
    );

    expect(ezp.values.filename).toBe("Q3 Budget.xlsx");
  });

  test("getFileAsync failure shows an error, not the spinner", async () => {
    ezp.authorized = true;
    await startTaskpane(WORD_DESKTOP, { getFileFails: true });

    expect(visibleSections()).toEqual(["#errorSection"]);
    expect(errorText()).toBe(en.genericError);
    expect(ezp.open).not.toHaveBeenCalled();
  });

  test("a failing slice shows an error and still closes the file", async () => {
    ezp.authorized = true;
    await startTaskpane(WORD_DESKTOP, { pdf: new Uint8Array(12), sliceSize: 4, sliceFailsAt: 1 });

    expect(visibleSections()).toEqual(["#errorSection"]);
    expect(office.closeAsync).toHaveBeenCalledTimes(1);
    expect(ezp.open).not.toHaveBeenCalled();
  });
});

describe("printing again", () => {
  test("after printFinished the Print button exports again and re-triggers the filedata watcher", async () => {
    ezp.authorized = true;
    await startTaskpane();
    expect(isVisible("#continueSection")).toBe(false);

    window.dispatchEvent(new Event("printFinished"));
    expect(isVisible("#continueSection")).toBe(true);

    click("#printBtn");
    await settle();

    expect(office.getFileAsync).toHaveBeenCalledTimes(2);
    expect(ezp.open).toHaveBeenCalledTimes(2);
    // Reset to "" before the (identical) data, otherwise Stencil wouldn't call the watcher.
    const fileDataWrites = ezp.writesTo("filedata");
    expect(fileDataWrites).toHaveLength(4);
    expect(fileDataWrites[2]).toBe("");
    expect(fileDataWrites[3]).toBe(fileDataWrites[1]);
    expect(isVisible("#continueSection")).toBe(false);
  });

  test("an export error on reprint shows an error instead of an endless spinner", async () => {
    ezp.authorized = true;
    await startTaskpane();
    office.getFileAsync.mockImplementationOnce(
      (_t: string, _o: unknown, callback: (r: unknown) => void) =>
        Promise.resolve().then(() =>
          callback({ status: "failed", error: { code: 5001, message: "Internal Error" } })
        )
    );

    click("#printBtn");
    await settle();

    expect(visibleSections()).toEqual(["#errorSection"]);
  });
});

describe("sign-in dialog", () => {
  async function openDialog(options: OfficeMockOptions = {}) {
    await startTaskpane(WORD_DESKTOP, options);
    click("#authButton");
    await settle();
  }

  test("opens authRedirect.html on the add-in's own domain, carrying the ezeep auth URI", async () => {
    await openDialog();

    expect(office.displayDialogAsync).toHaveBeenCalledTimes(1);
    const [url, dialogOptions] = office.displayDialogAsync.mock.calls[0];
    const parsed = new URL(url);
    expect(parsed.origin).toBe("https://localhost:3000");
    expect(parsed.pathname).toBe("/authRedirect.html");
    expect(parsed.searchParams.get("authUri")).toBe(AUTH_URI);
    // Sizes are percentages of the screen; no promptBeforeOpen override.
    expect(dialogOptions).toEqual({ height: 60, width: 30 });
  });

  test("a code from the dialog signs in, then exports and opens ezeep printing", async () => {
    await openDialog();

    office.dialog.fire("dialogMessageReceived", {
      message: JSON.stringify({ code: "auth-code-1" }),
      origin: "x",
    });
    await settle();

    expect(office.dialog.close).toHaveBeenCalled();
    expect(ezp.values.code).toBe("auth-code-1");
    expect(office.getFileAsync).toHaveBeenCalledTimes(1);
    expect(ezp.open).toHaveBeenCalledTimes(1);
    expect(visibleSections()).toEqual(["#printingSection"]);
  });

  test("clears the single-use code once ezeep reports authSuccess", async () => {
    await openDialog();
    office.dialog.fire("dialogMessageReceived", {
      message: JSON.stringify({ code: "auth-code-1" }),
    });
    await settle();

    document.querySelector("ezp-printing").dispatchEvent(new Event("authSuccess"));

    expect(ezp.values.code).toBeUndefined();
  });

  test("an error message from the dialog shows the sign-in failed message", async () => {
    await openDialog();

    office.dialog.fire("dialogMessageReceived", {
      message: JSON.stringify({ error: "access_denied" }),
    });
    await settle();

    expect(visibleSections()).toEqual(["#errorSection"]);
    expect(errorText()).toBe(en.signInFailed);
    expect(ezp.open).not.toHaveBeenCalled();
  });

  test("a non-JSON message is treated as a failed sign-in", async () => {
    await openDialog();

    office.dialog.fire("dialogMessageReceived", { message: "raw-code-from-old-redirect-page" });
    await settle();

    expect(errorText()).toBe(en.signInFailed);
  });

  test("user closing the dialog (12006) keeps the sign-in screen", async () => {
    await openDialog();

    office.dialog.fire("dialogEventReceived", { error: 12006 });
    await settle();

    expect(visibleSections()).toEqual(["#authSection"]);
  });

  test("a failure to open the dialog shows an error instead of throwing", async () => {
    await openDialog({ dialogFailsWith: 12007 });

    expect(visibleSections()).toEqual(["#errorSection"]);
    expect(errorText()).toBe(en.dialogError);
  });
});

describe("log out", () => {
  test("calls ezp-printing logOut() and returns to the sign-in screen", async () => {
    ezp.authorized = true;
    await startTaskpane();

    click("#logoutBtn");
    await settle();

    expect(ezp.logOut).toHaveBeenCalledTimes(1);
    expect(visibleSections()).toEqual(["#authSection"]);
  });
});

describe("localisation", () => {
  test("German Office shows German texts", async () => {
    await startTaskpane(WORD_DESKTOP, { displayLanguage: "de-DE" });

    expect(document.getElementById("signInDesc").innerText).toBe("Anmelden");
  });
});
