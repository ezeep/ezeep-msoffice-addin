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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
let file: File;
Office.onReady(async (info) => {
  ezpPrinting = document.querySelector("ezp-printing");
  printingSection = document.querySelector("#printingSection");
  authBtn = document.querySelector("#authButton");
  authSection = document.querySelector("#authSection");
  printBtn = document.querySelector("#printBtn");

  printBtn.onclick = async () => await ezpPrinting.open();
  authSection.style.display = "block";
  printingSection.style.display = "none";
  authBtn.addEventListener("click", openAuthDialog);

  language = Office.context.displayLanguage.toLowerCase();
  await initi18n(language);
  translate();

  if (info.host === Office.HostType.Word) {
    authorized = await ezpPrinting.checkAuth();

    getFile().then(() => {
      if (authorized) {
        authSection.style.display = "none";
        printingSection.style.display = "block";
      } else {
        printingSection.style.display = "none";
        authSection.style.display = "block";
      }
    });
  }
});

function showMessage(message) {
  const messageElement = document.getElementById("message");
  messageElement.innerText = message;
}

export async function getFile() {
  //Get the current file
  Office.context.document.getFileAsync(Office.FileType.Pdf, async (asyncResult: Office.AsyncResult<Office.File>) => {
    if (asyncResult.status === Office.AsyncResultStatus.Failed) {
      showMessage("Error: " + asyncResult.error.message);
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
      showMessage(`getSliceAsync Error:${sliceResult.error.message}`);
    }
  });
}

async function onGotAllSlices(docdataSlices) {
  var docdata = [];
  for (var i = 0; i < docdataSlices.length; i++) {
    docdata = docdata.concat(docdataSlices[i]);
  }
  fileData = docdata;
  const filearray = new Uint8Array(fileData);
  const filestring = filearray.toString();
  ezpPrinting.setAttribute("filedata", filestring);
  ezpPrinting.setAttribute("filename", "test.pdf");
  if (authorized) ezpPrinting.open();
}

async function openAuthDialog() {
  const authUri = await ezpPrinting.getAuthUri();
  // open office dialog
  Office.context.ui.displayDialogAsync(authUri, { height: 300, width: 300, promptBeforeOpen: false }, (result) => {
    const dialog = result.value;
    // process message from the dialog
    dialog.addEventHandler(Office.EventType.DialogMessageReceived, (arg: any) => {
      ezpPrinting.setAttribute("code", arg.message);
      dialog.close();
      printingSection.style.display = "block";
      authSection.style.display = "none";
      ezpPrinting.open();
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
  document.getElementById("printBtnDesc").innerText = i18next.t("printButton");
  document.getElementById("signInDesc").innerText = i18next.t("signIn");
  document.getElementById("subtitle").innerText = i18next.t("subtitle");
  document.getElementById("createAccDesc").innerText = i18next.t("createAccount");
  document.getElementById("printBtnLabel").innerText = i18next.t("continue");
}
