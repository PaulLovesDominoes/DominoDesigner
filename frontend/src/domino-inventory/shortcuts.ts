/**
 * Making up a keyboard shortcut for a colour that arrived without one.
 *
 * A shortcut is what the domino editing mode's keyboard picks a swatch by: the
 * user types it and the matching colour is applied. That consumer is what fixes
 * the rules here — see designer/DominoEditor.tsx's keydown handler, which
 * uppercases what it matches, only ever reads the keys A-Z and 0-9, and narrows
 * live as the user types. So a generated shortcut is uppercase, alphanumeric,
 * at most 3 characters, and unique across the inventory: two colours sharing one
 * would leave the second unreachable from the keyboard, since a buffer matching
 * two entries never resolves.
 */

/** The cell's maxLength in InventoryTable, and as much as anyone wants to type. */
const MAX_SHORTCUT_LENGTH = 3;

const VOWELS = "AEIOU";

/**
 * Turns whatever the user called a colour into the letters and digits a
 * shortcut can be built from, split into words. Anything else — spaces,
 * hyphens, slashes, punctuation — is a word boundary, so "Blue-Green",
 * "Blue Green" and "Blue/Green" all give the same two words.
 */
function wordsOf(colorName: string): string[] {
  return colorName
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((word) => word !== "");
}

/**
 * The characters to try building a shortcut from, best first.
 *
 * Two words or more, the initials win: "Sky Blue" gives SB, "Dark Forest Green"
 * gives DF. Initials are what a person reaches for unprompted, and they tell two
 * colours sharing a word ("Sky Blue" and "Sea Blue") apart at the first letter.
 *
 * A single word has no initials to take, so its consonants stand in: "Red"
 * gives RD, "Green" gives GR. Consonants rather than the first two letters
 * because they carry more of how a word looks — "Brown" gives BR either way,
 * but "Aqua" gives QA rather than AQ, and every A-word would otherwise start
 * the same.
 */
function preferredCharacters(colorName: string): string {
  const words = wordsOf(colorName);
  if (words.length === 0) return "";
  if (words.length >= 2) return words[0][0] + words[1][0];

  const word = words[0];
  const consonants = [...word].filter((ch) => !VOWELS.includes(ch));
  // A name with fewer than two consonants ("Aqua", "Ice") falls back on
  // whatever else it has, in order, so something is always produced.
  const backfill = [...word].filter((ch) => !consonants.includes(ch));
  return [...consonants, ...backfill].join("").slice(0, 2);
}

/**
 * A shortcut for `colorName` that is not in `taken`.
 *
 * `taken` holds the shortcuts already spoken for, uppercase; the caller adds
 * each result to it before asking for the next. Shortcuts given explicitly in
 * an uploaded file must go in first, or a generated one could take a name the
 * file itself was about to claim.
 *
 * Returns "" if nothing free could be found — an empty shortcut simply matches
 * no keystroke, which is exactly what a row added by hand has until someone
 * types one in.
 */
export function generateInventoryShortcut(colorName: string, taken: ReadonlySet<string>): string {
  const preferred = preferredCharacters(colorName);
  if (preferred === "") return "";
  if (!taken.has(preferred)) return preferred;

  // The pair is spoken for, so a digit tells this colour from the one that got
  // there first: SB, then SB2, SB3. Two characters plus a digit is exactly the
  // three a shortcut may hold, which is why the pair is never longer.
  for (let suffix = 2; suffix <= 9; suffix++) {
    const candidate = preferred.slice(0, MAX_SHORTCUT_LENGTH - 1) + suffix;
    if (!taken.has(candidate)) return candidate;
  }

  // Nine colours already share these two characters. Rather than give up, walk
  // every one- and two-character combination the name itself offers — a long
  // name has plenty — before returning nothing.
  const characters = wordsOf(colorName).join("");
  for (const first of characters) {
    if (!taken.has(first)) return first;
    for (const second of characters) {
      const candidate = first + second;
      if (!taken.has(candidate)) return candidate;
    }
  }
  return "";
}