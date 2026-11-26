// `showSaveFilePicker` is in the WICG File System Access spec and in Chromium,
// but not in TypeScript's DOM library. Optional, because other browsers lack it.

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: { description?: string; accept: Record<string, string[]> }[];
}

interface Window {
  showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
}
