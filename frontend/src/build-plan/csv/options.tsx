import type { BuildPlanOptionsProps } from "../base";
import styles from "../planOptions.module.css";
import type { CsvPlanOptions } from "./object-model";

/**
 * The CSV export's panel.
 *
 * A CSV has no paper and no pagination, so unlike the other two plans there is
 * nothing to set — what is left is telling the user what the file will hold
 * before they save it. That is worth a panel on its own: the figures come
 * straight off the model, so this is the one place they can be checked against
 * the element before the file leaves the app.
 */
export default function CsvPlanEditor({ model }: BuildPlanOptionsProps<CsvPlanOptions>) {
  return (
    <div className={styles.summary}>
      <div>
        A grid of <strong>{model.rows}</strong> rows &times;{" "}
        <strong>{model.cols}</strong> columns, numbered from 1 at the upper left
      </div>
      <div>
        <strong>{model.totalDominoes}</strong> dominoes in{" "}
        <strong>{model.colors.length}</strong>{" "}
        {model.colors.length === 1 ? "color" : "colors"}
        {model.skipCount > 0 && <> — {model.skipCount} left empty</>}
      </div>
      <div>
        Each cell holds the color&rsquo;s legend number, and the legend below the
        grid gives its name, hex value and count
      </div>
    </div>
  );
}