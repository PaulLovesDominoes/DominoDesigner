import { keyLabel, type KeyName } from "../platform";
import {
  dominoOrientationCommand,
  DOMINO_ORIENTATION_COMMANDS,
} from "./dominoOrientationCommands";
import { useStructureStore } from "./store";
import { structureToolCommand } from "./structureToolCommands";
import styles from "./StructureHintBar.module.css";

/**
 * A key drawn as a key cap.
 *
 * `name` says what the key *does* rather than which key it is, so the cap reads
 * correctly on a Mac without this file knowing that Ctrl is Command there — see
 * platform.ts. A few caps are a literal character instead (the tool and
 * orientation letters, which come from their own command tables); those pass
 * `label`.
 */
function Key({ name, label }: { name?: KeyName; label?: string }) {
  return <span className={styles.key}>{name ? keyLabel(name) : label}</span>;
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
            <Key key={c.orientation} label={c.shortcutKey} />
          ))}
        </>
      )}

      <span className={styles.separator}>|</span>

      {tool === "createDominoes" ? (
        <>
          <span>Drag between junctions, or press an arrow, to place.</span>
          <Key label={structureToolCommand("rectangleSelect").shortcutKey} />
          <span>to select.</span>
        </>
      ) : (
        <>
          <span>Click or drag to select.</span>
          <Key name="add" />
          <span>adds,</span>
          <Key name="deleteElement" />
          <span>deletes.</span>
          <Key name="esc" />
          <span>to place.</span>
        </>
      )}

      <span className={styles.separator}>|</span>

      {/* Both keys for the layer, since the pair a machine has differs: a
          MacBook has no Page Up or Page Down at all. */}
      <Key name="layerDown" />
      <Key name="layerUp" />
      <span>change layer. {keyLabel("pan")} to pan.</span>
      <span>{keyLabel("rotate")} to rotate. Scroll to zoom.</span>
    </div>
  );
}