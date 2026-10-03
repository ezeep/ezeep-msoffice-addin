/*
 * Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
 * See LICENSE in the project root for license information.
 */

import translationsDE from "../locales/de.json";
import translationsEN from "../locales/en.json";
import i18next from "i18next";

/* global console, customElements, document, navigator, window, Excel, Office */

type Section = "loading" | "auth" | "printing" | "noData" | "ie" | "error";

// How long to wait for the ezeep-js web component to register before giving up.
const COMPONENT_TIMEOUT_MS = 15000;
// Maximum slice size Office allows on Windows, Mac and the web (4 MB).
const SLICE_SIZE = 4194304;

let ezpPrinting: any;
let sections: Record<Section, HTMLElement>;
let continueSection: HTMLDivElement;
let errorMessage: HTMLElement;
let authorized = false;
let language = "";
let host = "";
let filename = "";

Office.onReady(async (info) => {
  try {
    await init(info);
  } catch (error) {
    showError("genericError", error);
  }
});

async function init(info: { host: Office.HostType; platform: Office.PlatformType }) {
  sections = {
    loading: document.querySelector("#loading"),
    auth: document.querySelector("#authSection"),
    printing: document.querySelector("#printingSection"),
    noData: document.querySelector("#noDataSection"),
    ie: document.querySelector("#iesection"),
    error: document.querySelector("#errorSection"),
  };
  continueSection = document.querySelector("#continueSection");
  errorMessage = document.querySelector("#errorMessage");
  ezpPrinting = document.querySelector("ezp-printing");

  // Legacy Edge (EdgeHTML) and Internet Explorer webviews can't run ezeep-js.
  // Chromium-based Edge reports "Edg/", so it doesn't match "Edge".
  if (navigator.userAgent.indexOf("Trident") > -1 || navigator.userAgent.indexOf("Edge") > -1) {
    show("ie");
    return;
  }

  language = (Office.context.displayLanguage || "").toLowerCase();
  await initi18n(language);
  translate();
  show("loading");

  if (info.host === Office.HostType.Word) {
    host = "Word";
  } else if (info.host === Office.HostType.Excel) {
    host = "Excel";
  } else {
    showError("unsupportedHost");
    return;
  }

  // getFileAsync doesn't support any file type in Word on the web, see
  // https://learn.microsoft.com/javascript/api/office/office.document#office-office-document-getfileasync-member(1)
  if (info.host === Office.HostType.Word && info.platform === Office.PlatformType.OfficeOnline) {
    showError("unsupportedWordOnline");
    return;
  }

  // The ezeep-js loader registers <ezp-printing> asynchronously, so Office.onReady can
  // fire before the element is upgraded and its methods exist.
  await whenDefined("ezp-printing", COMPONENT_TIMEOUT_MS);
  ezpPrinting.language = language.slice(0, 2);

  window.addEventListener("printFinished", () => {
    continueSection.style.display = "block";
  });
  document.querySelector<HTMLButtonElement>("#printBtn").onclick = () => runGuarded(preparePrint);
  document.querySelector<HTMLButtonElement>("#logoutBtn").onclick = () => runGuarded(logOut);
  document.querySelector<HTMLButtonElement>("#authButton").onclick = () => runGuarded(openAuthDialog);

  authorized = await ezpPrinting.checkAuth();
  filename = await loadFileName();

  if (host === "Excel" && (await isActiveSheetEmpty())) {
    show("noData");
    return;
  }

  if (!authorized) {
    show("auth");
    return;
  }

  await preparePrint();
}

/** Exports the document as PDF, hands it to ezeep-js and opens the print dialog. */
async function preparePrint() {
  continueSection.style.display = "none";
  show("loading");

  const pdf = await getPdfBytes();

  // filename must be set before filedata: ezp-printing builds the File object in its
  // filedata watcher and reads the filename at that moment.
  ezpPrinting.filename = filename || `${host}-${new Date().toLocaleString(language)}.pdf`;
  // Reset first, so printing the same unchanged document again still triggers the watcher.
  ezpPrinting.filedata = "";
  ezpPrinting.filedata = toBinaryString(pdf);

  show("printing");
  await ezpPrinting.open();
}

/** Promise wrapper around getFileAsync that reads every slice and always closes the file. */
function getPdfBytes(): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    Office.context.document.getFileAsync(Office.FileType.Pdf, { sliceSize: SLICE_SIZE }, (result) => {
      if (result.status !== Office.AsyncResultStatus.Succeeded) {
        reject(new Error(`getFileAsync failed: ${result.error.code} ${result.error.message}`));
        return;
      }
      const file = result.value;
      readAllSlices(file).then(
        (bytes) => file.closeAsync(() => resolve(bytes)),
        (error) => file.closeAsync(() => reject(error))
      );
    });
  });
}

async function readAllSlices(file: Office.File): Promise<Uint8Array> {
  const bytes = new Uint8Array(file.size);
  let offset = 0;
  for (let index = 0; index < file.sliceCount; index++) {
    const data = await getSlice(file, index);
    bytes.set(data, offset);
    offset += data.length;
  }
  return offset === bytes.length ? bytes : bytes.subarray(0, offset);
}

function getSlice(file: Office.File, index: number): Promise<number[]> {
  return new Promise((resolve, reject) => {
    file.getSliceAsync(index, (result) => {
      if (result.status === Office.AsyncResultStatus.Succeeded) {
        resolve(result.value.data);
      } else {
        reject(new Error(`getSliceAsync(${index}) failed: ${result.error.code} ${result.error.message}`));
      }
    });
  });
}

/** ezp-printing expects filedata as a binary string (one char per byte). */
function toBinaryString(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let result = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    result += String.fromCharCode.apply(null, Array.prototype.slice.call(bytes, i, i + chunkSize));
  }
  return result;
}

async function openAuthDialog() {
  const authUri: string = await ezpPrinting.getAuthUri();

  // The first page of an Office dialog must be on the add-in's own domain, so the dialog
  // opens authRedirect.html, which forwards to the ezeep login page.
  // https://learn.microsoft.com/office/dev/add-ins/develop/dialog-api-in-office-add-ins
  const startUrl = new URL("authRedirect.html", window.location.href);
  startUrl.searchParams.set("authUri", authUri);

  Office.context.ui.displayDialogAsync(startUrl.toString(), { height: 60, width: 30 }, (result) => {
    if (result.status !== Office.AsyncResultStatus.Succeeded) {
      showError("dialogError", result.error);
      return;
    }
    const dialog = result.value;

    dialog.addEventHandler(Office.EventType.DialogMessageReceived, (arg) => {
      if (!("message" in arg)) {
        return;
      }
      dialog.close();
      runGuarded(() => handleAuthMessage(arg.message));
    });

    // 12006: the user closed the dialog. Nothing to do, the sign-in button stays available.
    dialog.addEventHandler(Office.EventType.DialogEventReceived, (arg) => {
      if ("error" in arg && arg.error !== 12006) {
        console.error(`Dialog event ${arg.error}`);
      }
    });
  });
}

async function handleAuthMessage(message: string) {
  let payload: { code?: string; error?: string };
  try {
    payload = JSON.parse(message);
  } catch {
    payload = { error: "invalid_message" };
  }
  if (!payload.code) {
    showError("signInFailed", payload.error);
    return;
  }

  // ezp-auth exchanges the code for tokens when it mounts, which open() triggers.
  // Authorization codes are single-use, so drop it once the exchange succeeded,
  // otherwise the next open() would try to redeem it again.
  ezpPrinting.addEventListener("authSuccess", () => (ezpPrinting.code = undefined), { once: true });
  ezpPrinting.code = payload.code;
  authorized = true;
  await preparePrint();
}

async function logOut() {
  await ezpPrinting.logOut();
  authorized = false;
  show("auth");
}

async function isActiveSheetEmpty(): Promise<boolean> {
  return Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.getActiveWorksheet();
    const range = sheet.getUsedRange();
    sheet.load("name");
    range.load(["address", "values"]);
    await context.sync();
    return range.address === `${sheet.name}!A1` && range.values[0][0] === "";
  });
}

function loadFileName(): Promise<string> {
  return new Promise((resolve) => {
    Office.context.document.getFilePropertiesAsync((result) => {
      const url = result.status === Office.AsyncResultStatus.Succeeded && result.value ? result.value.url : "";
      if (!url) {
        resolve("");
        return;
      }
      // Desktop returns a local path, the web a URL: take the last segment of either.
      const name = url.split(/[\\/]/).pop().split("?")[0];
      try {
        resolve(decodeURIComponent(name));
      } catch {
        resolve(name);
      }
    });
  });
}

function whenDefined(tagName: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error(`<${tagName}> was not defined within ${timeoutMs} ms`)),
      timeoutMs
    );
    customElements.whenDefined(tagName).then(() => {
      window.clearTimeout(timer);
      resolve();
    }, reject);
  });
}

function runGuarded(action: () => Promise<void>) {
  action().catch((error) => showError("genericError", error));
}

function show(section: Section) {
  (Object.keys(sections) as Section[]).forEach((key) => {
    if (sections[key]) {
      sections[key].style.display = key === section ? "block" : "none";
    }
  });
}

function showError(key: string, detail?: unknown) {
  if (detail !== undefined) {
    console.error(detail);
  }
  if (errorMessage) {
    errorMessage.innerText = i18next.isInitialized ? i18next.t(key) : translationsEN[key] || key;
  }
  if (sections) {
    show("error");
  }
}

async function initi18n(lng: string) {
  await i18next.init({
    resources: {
      en: { translation: translationsEN },
      de: { translation: translationsDE },
    },
    lng: lng || navigator.language,
    // allow keys to be phrases having `:`, `.`
    nsSeparator: false,
    fallbackLng: "en",
  });
}

function translate() {
  document.getElementById("signInDesc").innerText = i18next.t("signIn");
  document.getElementById("subtitle").innerText = i18next.t("subtitle");
  document.getElementById("createAccDesc").innerText = i18next.t("createAccount");
  document.getElementById("printBtnLabel").innerText = i18next.t("continue");
  document.getElementById("logoutBtnLabel").innerText = i18next.t("logout");
  document.getElementById("noDataSection").innerText = i18next.t("noData");
}
