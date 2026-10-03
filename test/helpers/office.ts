/**
 * Minimal fake of the Office.js surface the add-in uses. Callbacks are delivered
 * asynchronously (microtasks), like the real API, so ordering bugs still show up.
 */

export const HostType = {
  Word: "Word",
  Excel: "Excel",
  PowerPoint: "PowerPoint",
  Outlook: "Outlook",
};
export const PlatformType = { PC: "PC", Mac: "Mac", OfficeOnline: "OfficeOnline" };
const FileType = { Compressed: "compressed", Pdf: "pdf", Text: "text" };
const AsyncResultStatus = { Succeeded: "succeeded", Failed: "failed" };
const EventType = {
  DialogMessageReceived: "dialogMessageReceived",
  DialogEventReceived: "dialogEventReceived",
};

export interface OfficeMockOptions {
  displayLanguage?: string;
  /** PDF the "document" exports to. */
  pdf?: Uint8Array;
  /** Bytes per slice the fake hands out (real Office: up to 4 MB). */
  sliceSize?: number;
  /** Make getFileAsync itself fail. */
  getFileFails?: boolean;
  /** Make getSliceAsync fail for this slice index. */
  sliceFailsAt?: number;
  /** URL returned by getFilePropertiesAsync ("" = unsaved document). */
  fileUrl?: string;
  /** Make displayDialogAsync fail with this error code. */
  dialogFailsWith?: number;
  /** Excel used range of the active sheet. */
  excelUsedRange?: { address: string; values: unknown[][] };
}

export interface OfficeMock {
  Office: any;
  Excel: any;
  /** Runs the callback registered with Office.onReady and waits for it. */
  ready(info: { host: string; platform: string }): Promise<void>;
  getFileAsync: jest.Mock;
  closeAsync: jest.Mock;
  getSliceAsync: jest.Mock;
  displayDialogAsync: jest.Mock;
  messageParent: jest.Mock;
  dialog: {
    close: jest.Mock;
    /** Delivers an event to the handler the add-in registered. */
    fire(eventType: string, arg: unknown): void;
  };
}

const later = (fn: () => void) => Promise.resolve().then(fn);

export function installOfficeMock(options: OfficeMockOptions = {}): OfficeMock {
  const pdf = options.pdf ?? new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55]); // "%PDF-1.7"
  const sliceSize = options.sliceSize ?? 4;
  let readyCallback: ((info: unknown) => unknown) | undefined;
  const dialogHandlers: Record<string, (arg: unknown) => void> = {};

  const closeAsync = jest.fn((callback?: () => void) => later(() => callback && callback()));

  const getSliceAsync = jest.fn((index: number, callback: (result: unknown) => void) =>
    later(() => {
      if (index === options.sliceFailsAt) {
        callback({
          status: AsyncResultStatus.Failed,
          error: { code: 5001, message: "Internal Error" },
        });
        return;
      }
      const data = Array.from(pdf.subarray(index * sliceSize, (index + 1) * sliceSize));
      callback({ status: AsyncResultStatus.Succeeded, value: { index, data, size: data.length } });
    })
  );

  const getFileAsync = jest.fn(
    (_type: string, _opts: unknown, callback: (result: unknown) => void) =>
      later(() => {
        if (options.getFileFails) {
          callback({
            status: AsyncResultStatus.Failed,
            error: { code: 5001, message: "Internal Error" },
          });
          return;
        }
        callback({
          status: AsyncResultStatus.Succeeded,
          value: {
            size: pdf.length,
            sliceCount: Math.ceil(pdf.length / sliceSize),
            getSliceAsync,
            closeAsync,
          },
        });
      })
  );

  const dialog = {
    close: jest.fn(),
    addEventHandler: jest.fn((eventType: string, handler: (arg: unknown) => void) => {
      dialogHandlers[eventType] = handler;
    }),
    fire(eventType: string, arg: unknown) {
      const handler = dialogHandlers[eventType];
      if (!handler) throw new Error(`No handler registered for ${eventType}`);
      handler(arg);
    },
  };

  const displayDialogAsync = jest.fn(
    (_url: string, _opts: unknown, callback: (result: unknown) => void) =>
      later(() => {
        if (options.dialogFailsWith) {
          callback({
            status: AsyncResultStatus.Failed,
            error: { code: options.dialogFailsWith, message: "Dialog failed" },
          });
          return;
        }
        callback({ status: AsyncResultStatus.Succeeded, value: dialog });
      })
  );

  const messageParent = jest.fn();

  const Office = {
    HostType,
    PlatformType,
    FileType,
    AsyncResultStatus,
    EventType,
    onReady: jest.fn((callback: (info: unknown) => unknown) => {
      readyCallback = callback;
      return Promise.resolve();
    }),
    context: {
      displayLanguage: options.displayLanguage ?? "en-US",
      document: {
        getFileAsync,
        getFilePropertiesAsync: jest.fn((callback: (result: unknown) => void) =>
          later(() =>
            callback({ status: AsyncResultStatus.Succeeded, value: { url: options.fileUrl ?? "" } })
          )
        ),
      },
      ui: { displayDialogAsync, messageParent },
    },
  };

  const usedRange = options.excelUsedRange ?? { address: "Sheet1!A1:B2", values: [["a", "b"]] };
  const Excel = {
    run: jest.fn(async (batch: (context: unknown) => Promise<unknown>) => {
      const sheet = { name: "Sheet1", load: jest.fn() };
      const range = { ...usedRange, load: jest.fn() };
      const context = {
        workbook: {
          worksheets: {
            getActiveWorksheet: () => Object.assign(sheet, { getUsedRange: () => range }),
          },
        },
        sync: jest.fn(async () => undefined),
      };
      return batch(context);
    }),
  };

  (globalThis as any).Office = Office;
  (globalThis as any).Excel = Excel;

  return {
    Office,
    Excel,
    async ready(info) {
      if (!readyCallback) throw new Error("Office.onReady was not called by the module under test");
      await readyCallback(info);
    },
    getFileAsync,
    closeAsync,
    getSliceAsync,
    displayDialogAsync,
    messageParent,
    dialog,
  };
}
