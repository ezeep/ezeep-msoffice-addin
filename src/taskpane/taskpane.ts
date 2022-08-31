/* eslint-disable no-undef */
/*
 * Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
 * See LICENSE in the project root for license information.
 */

import translationsDE from "../locales/de.json";
import translationsEN from "../locales/en.json";
import i18next from "i18next";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
/* global document, Office, Word */
// eslint-disable-next-line no-undef
let ezpPrinting: any;
let printingSection: HTMLDivElement;
let authBtn: HTMLButtonElement;
let authorized: boolean = false;
let authSection: HTMLDivElement;
let fileData: any;
let language: string;
let printBtn: HTMLButtonElement;
let continueSection: HTMLDivElement;
let logOutBtn: HTMLButtonElement;
let loadingSection: HTMLDivElement;
let iesection: HTMLDivElement;
let noDataSection: HTMLDivElement;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
let file: File;
Office.onReady(async (info) => {
  printingSection = document.querySelector("#printingSection");
  authSection = document.querySelector("#authSection");
  continueSection = document.querySelector("#continueSection");
  iesection = document.querySelector("#iesection");
  loadingSection = document.querySelector("#loading");
  noDataSection = document.querySelector("#noDataSection");
  ezpPrinting = document.querySelector("ezp-printing");
  authBtn = document.querySelector("#authButton");
  printBtn = document.querySelector("#printBtn");
  logOutBtn = document.querySelector("#logoutBtn");

  language = Office.context.displayLanguage.toLowerCase();
  ezpPrinting.setAttribute("language", language.slice(0, 2));

  await initi18n(language);
  translate();

  // is legacy edge or ie?
  if (navigator.userAgent.indexOf("Trident") > -1 || navigator.userAgent.indexOf("Edge") > -1) {
    loadingSection.style.display = "none";
    continueSection.style.display = "none";
    authSection.style.display = "none";
    printingSection.style.display = "none";
    noDataSection.style.display = "none";
    iesection.style.display = "block";
    return;
  }

  iesection.style.display = "none";
  continueSection.style.display = "none";
  authSection.style.display = "none";
  printingSection.style.display = "none";
  noDataSection.style.display = "none";

  // eslint-disable-next-line no-undef
  window.addEventListener("printFinished", handlePrintFinished);

  printBtn.onclick = openPrinterSelection;
  logOutBtn.onclick = logOut;

  authBtn.onclick = openAuthDialog;

  authorized = await ezpPrinting.checkAuth();
  authSection.style.display = authorized ? "none" : "block";

  if (info.host === Office.HostType.Word) {
    getFile().then(() => {
      if (authorized) {
        noDataSection.style.display = "none";
        authSection.style.display = "none";
        printingSection.style.display = "block";
        loadingSection.style.display = "none";
      } else {
        noDataSection.style.display = "none";
        printingSection.style.display = "none";
        authSection.style.display = "block";
        loadingSection.style.display = "none";
      }
    });
  } else if (info.host === Office.HostType.Excel) {
    await Excel.run(async (context) => {
      const sheet = context.workbook.worksheets.getActiveWorksheet();
      const range = sheet.getUsedRange();
      sheet.load("name");
      range.load(["address", "values"]);
      await context.sync();

      if (range.address === `${sheet.name}!A1` && range.values[0][0] === "") {
        // no data in sheet
        noDataSection.style.display = "block";
        loadingSection.style.display = "none";
        authSection.style.display = "none";
      } else {
        getFile().then(() => {
          if (authorized) {
            noDataSection.style.display = "none";
            authSection.style.display = "none";
            printingSection.style.display = "block";
            loadingSection.style.display = "none";
          } else {
            noDataSection.style.display = "none";
            printingSection.style.display = "none";
            authSection.style.display = "block";
            loadingSection.style.display = "none";
          }
        });
      }
    });
  } else if (info.host === Office.HostType.Outlook) {
    // get email file
  }
});

export async function getFile() {
  //Get the current file
  Office.context.document.getFileAsync(Office.FileType.Pdf, async (asyncResult: Office.AsyncResult<Office.File>) => {
    if (asyncResult.status === Office.AsyncResultStatus.Failed) {
      // eslint-disable-next-line no-undef
      console.error("Error: " + asyncResult.error.message);
    } else {
      //Get the file
      const file = asyncResult.value;
      let slicesReceived = 0,
        gotAllSlices = true,
        docdataSlices = [],
        sliceCount = file.sliceCount;

      // Get the file slices.
      await getSliceAsync(file, 0, sliceCount, gotAllSlices, docdataSlices, slicesReceived);
      file.closeAsync();
    }
  });
}

async function getSliceAsync(
  file: Office.File,
  nextSlice: number,
  sliceCount: number,
  gotAllSlices: boolean,
  docdataSlices: any[],
  slicesReceived: number
) {
  file.getSliceAsync(nextSlice, async (sliceResult) => {
    if (sliceResult.status === Office.AsyncResultStatus.Succeeded) {
      if (!gotAllSlices) {
        // Failed to get all slices, no need to continue.
        return;
      }

      // Got one slice, store it in a temporary array.
      // (Or you can do something else, such as
      // send it to a third-party server.)
      docdataSlices[sliceResult.value.index] = sliceResult.value.data;
      if (++slicesReceived == sliceCount) {
        // All slices have been received.

        file.closeAsync();
        await onGotAllSlices(docdataSlices);
      } else {
        getSliceAsync(file, ++nextSlice, sliceCount, gotAllSlices, docdataSlices, slicesReceived);
      }
    } else {
      gotAllSlices = false;
      file.closeAsync();
      // eslint-disable-next-line no-undef
      console.error(`getSliceAsync Error:${sliceResult.error.message}`);
    }
  });
}

async function onGotAllSlices(docdataSlices) {
  var docdata = [];
  for (var i = 0; i < docdataSlices.length; i++) {
    docdata = docdata.concat(docdataSlices[i]);
  }
  fileData = docdata;
  let filearray = new Uint8Array(fileData);
  let reader = new FileReader();
  let filestring: string | ArrayBuffer;
  reader.onload = () => {
    filestring = reader.result;

    ezpPrinting.setAttribute("filedata", filestring);
    ezpPrinting.setAttribute("filename", "test.pdf");
    if (authorized) ezpPrinting.open().then(() => (loadingSection.style.display = "none"));
    // delete filestring from memory
    fileData = null;
    filearray = null;
    filestring = null;
  };

  // read filedata as binary string
  reader.readAsBinaryString(new Blob([filearray]));
}

async function openAuthDialog() {
  const authUri = await ezpPrinting.getAuthUri();
  // open office dialog
  Office.context.ui.displayDialogAsync(authUri, { height: 300, width: 300, promptBeforeOpen: false }, (result) => {
    if (result.status === Office.AsyncResultStatus.Failed) {
      // eslint-disable-next-line no-undef
      console.log(`Error: ${result.error.message}`);
    }
    const dialog = result.value;
    // process message from the dialog
    dialog.addEventHandler(Office.EventType.DialogMessageReceived, (arg: any) => {
      ezpPrinting.setAttribute("code", arg.message);
      dialog.close();
      printingSection.style.display = "block";
      authSection.style.display = "none";
      ezpPrinting.open();
      authorized = true;
    });
  });
}

async function initi18n(language?: string) {
  const resources = {
    en: {
      translation: translationsEN,
    },
    de: {
      translation: translationsDE,
    },
  };
  // override browserlanguage if language is provided
  if (language != "") {
    await i18next.init({
      resources,
      lng: language,
      // allow keys to be phrases having `:`, `.`
      nsSeparator: false,
      fallbackLng: "en",
    });
  } else {
    await i18next.init({
      resources,
      // eslint-disable-next-line no-undef
      lng: navigator.language,
      // allow keys to be phrases having `:`, `.`
      nsSeparator: false,
      fallbackLng: "en",
    });
  }
}

function translate() {
  document.getElementById("signInDesc").innerText = i18next.t("signIn");
  document.getElementById("subtitle").innerText = i18next.t("subtitle");
  document.getElementById("createAccDesc").innerText = i18next.t("createAccount");
  document.getElementById("printBtnLabel").innerText = i18next.t("continue");
  document.getElementById("logoutBtnLabel").innerText = i18next.t("logout");
  document.getElementById("noDataSection").innerText = i18next.t("noData");
}

const handlePrintFinished = () => {
  continueSection.style.display = "block";
};

const openPrinterSelection = async () => {
  continueSection.style.display = "none";
  loadingSection.style.display = "";
  await getFile();
};

const logOut = async () => {
  await ezpPrinting.logOutandRevokeToken();
  printingSection.style.display = "none";
  authSection.style.display = "block";
};
