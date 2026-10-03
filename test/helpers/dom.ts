/* global document, jest, window */

import fs from "fs";
import path from "path";

const taskpaneHtml = fs.readFileSync(path.join(__dirname, "../../src/taskpane/taskpane.html"), "utf8");

/** Puts the real task pane markup (without its <script> tags) into the jsdom document. */
export function loadTaskpaneDom() {
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(taskpaneHtml)[1];
  document.body.innerHTML = body;
}

/** Loads src/taskpane/taskpane.ts fresh (new module state, new Office.onReady registration). */
export function loadTaskpaneModule() {
  jest.isolateModules(() => {
    require("../../src/taskpane/taskpane");
  });
}

/** Waits until queued callbacks and promise chains started by click handlers have run. */
export async function settle(rounds = 10) {
  for (let i = 0; i < rounds; i++) {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  }
}

export function isVisible(selector: string): boolean {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`${selector} not found`);
  return element.style.display !== "none";
}

/** Which of the top-level task pane sections are currently shown. */
export function visibleSections(): string[] {
  return ["#loading", "#authSection", "#printingSection", "#noDataSection", "#iesection", "#errorSection"].filter(
    isVisible
  );
}

export function errorText(): string {
  return document.querySelector<HTMLElement>("#errorMessage").innerText;
}

export function click(selector: string) {
  document.querySelector<HTMLElement>(selector).click();
}

/** Binary string the add-in is expected to hand to ezp-printing (one char per byte). */
export function binaryString(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => String.fromCharCode(b)).join("");
}
