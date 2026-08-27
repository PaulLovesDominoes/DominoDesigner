import { DominoSidewaysIcon } from "../../../icons";
import type { StructureOperationBase, StructureOperationDefinition } from "../base";
import type { PlacedDomino } from "./dominoes";
import DominoGroupEditor from "./editor";

/**
 * A set of dominoes placed on the structure.
 *
 * Where the dominoes actually are and how a drag becomes one is dominoes.ts;
 * this file is the shape of the data and the registry entry.
 *
 * **This type is a folder plus *two* registry lines rather than three**, which
 * is the one place it departs from the pattern this screen's CLAUDE.md
 * describes: there is no toolbar button for it, because a group is not created
 * by a command. It comes into being when the first domino is placed, takes every
 * domino placed after that, and shows up in the sidebar without a properties
 * dialog ever opening. Its `toolbarLabel` is left unset for that reason.
 *
 * **There is only ever one group** in this release, and every domino goes into
 * it whatever layer it stands on — see `effectiveDominoGroup` in dominoes.ts,
 * which is where that rule lives. Later releases are expected to add more
 * groups, and to let a group be replicated, made conditional, or given
 * parameters; the properties dialog is one read-only line today because there is
 * nothing yet to put in it.
 *
 * Deleting the group deletes its dominoes, which needs no code at all: they are
 * fields of the operation, so the sidebar's Delete takes them with it and undo
 * brings them back.
 */

export interface DominoGroupOperation extends StructureOperationBase {
  type: "dominoGroup";
  /**
   * Every domino in the group, in the order they were placed. Dominoes from
   * different layers sit in the one list — a group is a set of dominoes, not a
   * course.
   */
  dominoes: PlacedDomino[];
}

export const dominoGroupDefinition: StructureOperationDefinition<DominoGroupOperation> =
  {
    type: "dominoGroup",
    // The sideways domino, which is also the orientation the placement tool
    // starts on — by far the commonest way a domino is set up in a structure.
    icon: DominoSidewaysIcon,
    defaultName: "Domino Group",
    create: (id) => ({
      id,
      name: "Domino Group",
      type: "dominoGroup",
      dominoes: [],
    }),
    rowBadge: (operation) => `(${operation.dominoes.length})`,
    editor: DominoGroupEditor,
  };