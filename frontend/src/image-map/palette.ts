import type { InventoryEntry, InventoryEntryId } from "../domino-inventory/object-model";

/**
 * Which inventory colours a mapping run is allowed to choose from.
 *
 * "all" is every active inventory entry — what a run always used before this
 * existed. "selected" narrows that to the swatches the user has ticked in the
 * sidebar while the Map Image Colors panel is up.
 */
export type ImageMapColorScope = "all" | "selected";

/**
 * The ticked swatches are stored as the ones turned *off*, so an empty record
 * means every colour is in.
 *
 * That inversion is deliberate and worth keeping. The store slice cannot read
 * `inventoryEntries` while it is building its own initial state, so a positive
 * set would need either an initialisation step somewhere else — which fights the
 * decision that a user's picks are remembered across mode entries — or a
 * "null means all" sentinel, which is two encodings of one state. Storing the
 * exclusions needs neither, and it also means a colour added to the inventory
 * later starts out included, which is the right default.
 */
export type ImageMapExcludedColorIds = Record<InventoryEntryId, true>;

/** Whether this inventory entry is ticked. */
export function isImageMapColorPicked(
  excluded: ImageMapExcludedColorIds,
  entryId: InventoryEntryId,
): boolean {
  return excluded[entryId] !== true;
}

/**
 * The inventory entries a mapping run may choose from.
 *
 * This is the single answer two consumers read — ImageMapPanel, to decide
 * whether Map Colors has anything to work with, and startColorMapping, which
 * hands the result to the metric's prepare(). Working it out in one place is
 * what stops a greyed-out button and an empty run disagreeing about why.
 *
 * `active` is filtered here as well as inside every metric's prepare(), so a
 * palette that looks non-empty here can never come out empty there.
 */
export function imageMapPaletteEntries(
  entries: readonly InventoryEntry[],
  scope: ImageMapColorScope,
  excluded: ImageMapExcludedColorIds,
): InventoryEntry[] {
  return entries.filter(
    (entry) => entry.active && (scope === "all" || isImageMapColorPicked(excluded, entry.id)),
  );
}