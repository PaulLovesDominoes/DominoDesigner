import { useState, type ReactNode } from "react";

import { useStore } from "../store";
import { hasUndoEditsSinceBarrier } from "../history/appStoreSlice";
import ConfirmDialog from "../components/ConfirmDialog";
import { getDominoBrush } from "../paint-brush/registry";
import { placementToolFor } from "./toolConfig";
import styles from "./ModeHintBar.module.css";

/**
 * A permanently-visible strip in the toolbar's old spot, telling the user what
 * to do next — what a placement tool's drag does, how to back out of it, or
 * (in Select mode) how to get started. Always mounted with the same wrapper
 * markup across every branch so its height never changes, which is the whole
 * point: it now occupies the space the toolbar used to, so the canvas doesn't
 * resize when the hint content changes underneath it. Sits in the layout
 * rather than over the canvas so it can't intercept the very drag it
 * describes. While domino editing mode is active, it instead shows that
 * mode's own Done/Cancel/Help controls — the only way out of the mode, since
 * it's fully modal (see store.ts's dominoEditingId).
 */
export default function ModeHintBar() {
  const activeTool = useStore((s) => s.activeTool);
  // Which element type the "newElement" tool is armed with, so its prompt can
  // name it. Adding a placeable type means adding its placementHint to
  // PLACEMENT_TOOLS, not editing this component's markup.
  const newElementType = useStore((s) => s.newElementType);
  // While the properties dialog is open the drag is disarmed, so prompting for
  // one would be a lie.
  const editing = useStore((s) => s.editingDDObjectId !== null);

  const selectedDDObjectId = useStore((s) => s.selectedDDObjectId);

  const dominoEditingId = useStore((s) => s.dominoEditingId);
  const dominoEditingObject = useStore((s) =>
    s.dominoEditingId ? s.ddObjects[s.dominoEditingId] ?? null : null,
  );
  const exitDominoEditing = useStore((s) => s.exitDominoEditing);
  const cancelDominoEditing = useStore((s) => s.cancelDominoEditing);
  // Whether Cancel has anything to discard — the same barrier comparison undo()
  // clamps on. A primitive, so no useShallow needed.
  const hasEdits = useStore((s) =>
    hasUndoEditsSinceBarrier(s.undoStack, s.dominoEditingUndoBarrier),
  );
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const openHelpTopic = useStore((s) => s.openHelpTopic);
  // Whether a colour has been chosen at all. Only a brush's sentence depends on
  // it: a brush with nothing to lay down draws no nib, and this is what says so.
  const dominoSelectedSwatchId = useStore((s) => s.dominoSelectedSwatchId);
  // What the armed shape-select gesture is asking for, if any — written by
  // DominoEditor, since a variant's hint can vary by stage and the live
  // gesture state lives in a ref inside the <Canvas>. A string, so it's safe to
  // read straight out of a selector.
  const dominoShapeSelectHint = useStore((s) => s.dominoShapeSelectHint);
  // Which paint brush is armed, if any. Unlike a shape's, a brush's hint has no
  // stages, so it comes straight off the registry rather than needing a store
  // field DominoEditor writes.
  const dominoBrushId = useStore((s) => s.dominoBrushId);
  // Image mapping mode, and whether a picture has actually been loaded — the
  // sentence differs, since with no picture the only useful thing to say is how
  // to get one.
  const setImageMapActive = useStore((s) => s.setImageMapActive);
  const imageMapActive = useStore((s) => s.imageMapActive);
  // Resize and Move, which needs a sentence of its own: it is the one sub-mode
  // whose two ways out are not written down anywhere else.
  const imageTransformActive = useStore((s) => s.imageTransformActive);
  // Only ever set by a failed image load. Shown here as well as in the sidebar
  // because a picture can now be loaded with that sidebar closed.
  const imageMapMessage = useStore((s) => s.imageMapMessage);  // The root BuildPlane always exists and always has a children array — this
  // is "are there any DDObjects yet" for the Select-mode idle hint below.
  const hasElements = useStore((s) => {
    const root = s.ddObjects[s.rootId];
    return "children" in root && root.children.length > 0;
  });

  let content: ReactNode;

  if (!editing && dominoEditingId && dominoEditingObject) {
    // The sentence at the end is chosen most-specific-first: image mapping mode,
    // then an armed shape, then an armed brush, then the standing advice. What
    // the user is *doing* outranks where they are, the same rule
    // help/registry.ts applies when it consults TOOL_TOPIC before SCREEN_TOPIC.
    // Image mapping goes first because it is a mode rather than a choice within
    // one — the other three cannot be armed while it is on.
    //
    // Done/Cancel are the only ways out of domino editing mode; nothing in this
    // bar ever means "press ESC to leave".
    content = (
      <>
        {/* Leaving colour mapping is its own thing, and comes first with a rule
            after it: it closes a sub-mode, where Done and Cancel leave domino
            editing altogether. Without the separation the three read as one row
            of equals and it is far too easy to press Cancel meaning "close this
            panel" and throw the whole session away. The sidebar's own X does the
            same job for anyone looking there instead. */}
        {imageMapActive && (
          <>
            <button className={styles.textBtn} onClick={() => setImageMapActive(false)}>
              Close Image Mapping
            </button>
            <span className={styles.separator} aria-hidden="true" />
          </>
        )}
        {/* Done commits; Cancel rolls the mode's edits back. Cancel only warns
            when there is actually something to lose — with nothing recorded
            since entry the two are indistinguishable to the user, and a prompt
            asking about edits that don't exist would just be noise. */}
        {!imageMapActive && (
          <>
            <button className={styles.textBtn} onClick={exitDominoEditing}>
              Done
            </button>
            <button
              className={styles.textBtn}
              onClick={() => (hasEdits ? setConfirmingCancel(true) : cancelDominoEditing())}
            >
              Cancel
            </button>
        </>
        )}
        {/* Help follows whichever mode is on, so it opens on the page about the
            thing the user is actually doing. */}
        <button
          className={styles.textBtn}
          onClick={() => openHelpTopic(imageTransformActive ? "image-mapping" : "domino-editing")}
        >
          Help
        </button>
        {imageMapMessage ? (
          // A failed image load says so here as well as in the sidebar, since
          // the sidebar only shows while colour mapping is on and a picture can
          // be loaded from the toolbar at any time. It replaces the sentence
          // rather than adding a row, so the bar's fixed height is unaffected.
          <span>{imageMapMessage}</span>
        ) : imageTransformActive ? (
          <span>
            Drag the image to move it, or its handles to resize it. Type ESC or click away
            from the image when done.
          </span>
        ) : imageMapActive ? ( 
          <span>
            Set mapping options in the left-hand sidebar then click 'Map Colors' to map the image onto the dominoes.
          </span>
        ) : dominoShapeSelectHint ? (
          <span>{dominoShapeSelectHint}</span>
        ) : dominoBrushId ? (
          <span>
            {dominoSelectedSwatchId
              ? getDominoBrush(dominoBrushId).hint
              : "Click a color swatch in the sidebar to choose what this brush paints."}
          </span>
        ) : (
          <span>
            Select dominoes then click on a swatch in the sidebar to set the color.
          </span>
        )}
        {confirmingCancel && (
          <ConfirmDialog
            message="Are you sure you wish to cancel your edits? Note! This can not be undone."
            confirmLabel="Yes, cancel my edits"
            cancelLabel="No, continue editing"
            onConfirm={() => {
              setConfirmingCancel(false);
              cancelDominoEditing();
            }}
            onCancel={() => setConfirmingCancel(false)}
          />
        )}
      </>
    );
  } else {
    // "select" is deliberately absent from PLACEMENT_TOOLS and gets its own
    // idle hint below (it depends on whether any DDObjects exist yet, rather
    // than being one fixed string), and "editDominoes" took the branch above.
    const hint = editing ? undefined : placementToolFor(newElementType)?.placementHint;
    if (hint) {
      content = (
        <>
          <span>{hint}</span>
          <span>·</span>
          <kbd className={styles.key}>Esc</kbd>
          <span>to cancel</span>
        </>
      );
    } else if (!editing && activeTool === "select") {
      content = (
        <span>
          {hasElements
            ? (selectedDDObjectId ? 'Use handles to resize selected element, click-drag to move, double-click to edit colors, DEL to delete.' :
              'Click on an element to select it, double-click to edit colors, right-click to pan.')
            : 'Click "New" to add an element to your build plane, right-click to pan.'}
        </span>
      );
    } else {
      // Fallback for any other state (e.g. the properties dialog open) —
      // nothing meaningful to say, but the same wrapper keeps the row's
      // height constant.
      content = <span>&nbsp;</span>;
    }
  }

  // id is a measurement hook for PropertiesDialog's initial-centering layout
  // effect, which needs this row's actual (intrinsic, content-driven) height
  // now that it's permanently occupying the toolbar's old spot.
  return (
    <div id="mode-hint-bar" className={styles.bar} role="status">
      {content}
    </div>
  );
}
