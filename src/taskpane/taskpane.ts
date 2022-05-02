/*
 * Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
 * See LICENSE in the project root for license information.
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
/* global document, Office, Word */
let ezpPrinting: any;
let authBtn: HTMLButtonElement;
let authorized: boolean = false;
let authSection: HTMLDivElement;
let fileData: any;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
let file: File;
Office.onReady(async (info) => {
  if (info.host === Office.HostType.Word) {
    //authorized = await ezpPrinting.isAuthorized();
    ezpPrinting = document.querySelector("ezp-printing");
    authBtn = document.querySelector("#authButton");
    authSection = document.querySelector("#authSection");
    await getFile();
    if (authorized) {
      authSection.style.display = "none";
      ezpPrinting.style.display = "block";
    } else {
      ezpPrinting.style.display = "none";
      authSection.style.display = "block";
      authBtn.addEventListener("click", openAuthDialog);
    }
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
      ezpPrinting.style.display = "block";
      authSection.style.display = "none";
      ezpPrinting.open();
    });
  });
}
