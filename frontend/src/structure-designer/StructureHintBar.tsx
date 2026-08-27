import {
  dominoOrientationCommand,
  DOMINO_ORIENTATION_COMMANDS,
} from "./dominoOrientationCommands";
import { useStructureStore } from "./store";
import { structureToolCommand } from "./structureToolCommands";
import styles from "./StructureHintBar.module.css";

/** A key drawn as a key, e.g. `Ctrl`. */
function Key({ children }: { children: string }) {
  return <span className={styles.key}>{children}</span>;
}

/**
 * Says what a drag on the canvas will do, which way up the next domino goes, and
 * how to move the view.
 *
 * The tool and the orientation are reported here as well as by the pressed
 * toolbar buttons because the toolbar is a row of small glyphs and this is where
 * the screen says things in words — the drawing plus its name together are what
 * make it certain which is chosen.
 *
 * The rest is what would otherwise be undiscoverable. There is no button for
 * rotating the view, none for placing a domino or laying one with the arrow keys,
 * none for changing the layer from the keyboard, and the keys that choose an
 * orientation appear nowhere else; the Designer tells the user how to pan in this
 * same place, so this is where all of it belongs.
 *
 * **What is explained changes with the tool**, because the two have almost no
 * gestures in common and a bar carrying both would be too long to read. What
 * stays whatever the tool is: the layer keys and the view controls.
 */
export default function StructureHintBar() {
  const tool = useStructureStore((s) => s.tool);
  const dominoOrientation = useStructureStore((s) => s.dominoOrientation);

  const toolCommand = structureToolCommand(tool);
  const ToolIcon = toolCommand.icon;

  const orientation = dominoOrientationCommand(dominoOrientation);
  const OrientationIcon = orientation.icon;

  return (
    // The id is how StructureOperationDialog measures this bar's height when it
    // centres itself over the canvas area. The height is content-driven rather
    // than a CSS variable, so there is nothing else to read it from.
    <div id="structure-hint-bar" className={styles.bar} role="status">
      <ToolIcon size={20} className={styles.setting} />
      <span className={styles.setting}>{toolCommand.label}</span>

      {tool === "createDominoes" && (
        <>
          <OrientationIcon size={20} className={styles.setting} />
          <span className={styles.setting}>{orientation.label}</span>
          {/* The three keys, in the table's own order, so the bar and the
              toolbar cannot disagree about which key does what. */}
          {DOMINO_ORIENTATION_COMMANDS.map((c) => (
            <Key key={c.orientation}>{c.shortcutKey}</Key>
          ))}
        </>
      )}

      <span className={styles.separator}>|</span>

      {tool === "createDominoes" ? (
        <>
          <span>Drag between junctions, or press an arrow, to place.</span>
          <Key>R</Key>
          <span>to select.</span>
        </>
      ) : (
        <>
          <span>Click or drag to select.</span>
          <Key>Ctrl</Key>
          <span>adds,</span>
          <Key>Del</Key>
          <span>removes.</span>
          <Key>Esc</Key>
          <span>to place.</span>
        </>
      )}

      <span className={styles.separator}>|</span>

      <Key>PgUp</Key>
      <Key>PgDn</Key>
      <span>change layer. Right-drag to pan.</span>
      <Key>Shift</Key>
      <span>+ right-drag to rotate. Scroll to zoom.</span>
    </div>
  );
}