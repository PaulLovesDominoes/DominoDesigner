/**
 * Handing the user a file the app made up itself.
 *
 * The mechanism is a link they never see: a browser downloads whatever an anchor
 * carrying a `download` attribute points at, and clicking one from code counts.
 * There is no other way short of the File System Access API, which only some
 * browsers have.
 *
 * It returns the same thing build-plan/html.ts's `openPlanTab` does — null when
 * the file was handed over, or the message to show when it was not — so a build
 * plan's `deliver` can be either of them with nothing else changing.
 *
 * This lived in build-plan/ until the inventory export wanted it too. Neither
 * function names anything about plans, so it sits at the top level beside
 * color.ts and csv.ts rather than being reached for across a folder boundary.
 */

/**
 * Characters a file name may not hold on Windows. A downloaded file is usually
 * named after something the user typed — an element's name, a colour's — so any
 * of these can turn up.
 */
const UNSAFE_FILE_NAME_CHARS = /[<>:"/\\|?*]/g;

/** Turns a user-typed name into something a file can be called. */
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