/**
 * Saving a finished build plan as a file, the other way a plan can be delivered.
 *
 * The sibling of html.ts's `openPlanTab`, and it returns the same thing — null
 * when the file was handed over, or the message to show when it was not — so a
 * plan's `deliver` can be either of them with nothing else changing.
 *
 * The mechanism is a link the user never sees: a browser downloads whatever an
 * anchor carrying a `download` attribute points at, and clicking one from code
 * counts. There is no other way to save a file the app made up itself, short of
 * the File System Access API, which only some browsers have.
 */

/**
 * Characters a file name may not hold on Windows. A plan is named after its
 * element, and an element's name is whatever the user typed into the properties
 * dialog, so any of these can turn up.
 */
const UNSAFE_FILE_NAME_CHARS = /[<>:"/\\|?*]/g;

/** Turns an element's name into something a file can be called. */
export function safeFileName(name: string): string {
  const cleaned = name
    .replace(UNSAFE_FILE_NAME_CHARS, " ")
    .replace(/\s+/g, " ")
    // A trailing dot or space is legal to write and then awkward to open on
    // Windows, so it goes as well.
    .replace(/[. ]+$/, "")
    .trim();
  // A name made up entirely of the characters just stripped would leave nothing
  // at all, and a file has to be called something.
  return cleaned === "" ? "Untitled" : cleaned;
}

/**
 * Saves `text` as a file. Always returns null — unlike opening a tab, a download
 * is not something a browser refuses, since no new window is involved.
 *
 * Must be reached synchronously from the click that asked for it, for the same
 * reason `openPlanTab` must: a browser only trusts a download it can still tie
 * to a user gesture. The object URL is released on the same timer and for the
 * same reason — revoking it before the browser has finished reading the blob
 * gives an empty file.
 */
export function downloadTextFile(
  text: string,
  fileName: string,
  mimeType: string,
): string | null {
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }));

  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  // Firefox only acts on a click if the link is actually in the document.
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return null;
}