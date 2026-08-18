import { useEffect, useMemo, useState } from "react";

import ConfirmDialog from "../components/ConfirmDialog";
import { useStore } from "../store";
import { useDominoDataStore } from "../dominoes/store";
import { buildPlanModel } from "./model";
import { getBuildPlan, getBuildPlanOptionsEditor } from "./registry";
import type { BuildPlanRequest } from "./appStoreSlice";
import styles from "./BuildPlanDialog.module.css";

/**
 * The options dialog for a build plan, and the one place a plan is generated and
 * handed over.
 *
 * It hosts whichever options panel the chosen plan declares, so adding a plan
 * never means editing this file — the same arrangement PropertiesDialog has with
 * a DDObject type's editor. The same goes for *how* a plan is delivered: the
 * primary button's wording and what pressing it does both come off the
 * definition, so a plan that saves a file rather than opening one for printing
 * needs no branch here.
 *
 * It is a **true modal**, unlike PropertiesDialog: it swallows keydown in the
 * capture phase, so DesignerScreen's Ctrl chords and DominoEditor's Delete key
 * cannot keep editing the very element being printed, and it is not draggable
 * because there is nothing underneath worth uncovering.
 */

export default function BuildPlanDialog() {
  const request = useStore((s) => s.buildPlanDialog);
  if (!request) return null;
  // Keyed on the request so switching plans starts the panel over rather than
  // carrying one plan's scroll position and derived figures into another's.
  return <Dialog key={`${request.planId}:${request.ddObjectId}`} request={request} />;
}

function Dialog({ request }: { request: BuildPlanRequest }) {
  const { planId, ddObjectId } = request;
  const ddObject = useStore((s) => s.ddObjects[ddObjectId]);
  const inventoryEntries = useStore((s) => s.inventoryEntries);
  const options = useStore((s) => s.buildPlanOptions[planId]);
  const setBuildPlanOptions = useStore((s) => s.setBuildPlanOptions);
  const closeBuildPlan = useStore((s) => s.closeBuildPlan);

  // The dominoes are read imperatively inside buildPlanModel, so the model has
  // to be rebuilt when they change. Subscribing to the version — a plain number
  // — is how every other consumer watches that buffer.
  const dominoVersion = useDominoDataStore((s) => s.versions[ddObjectId] ?? 0);

  // Set only when delivering the finished plan failed, and holding the reason —
  // which the plan itself supplies, since only it knows how it was delivered.
  const [failureMessage, setFailureMessage] = useState<string | null>(null);

  const definition = getBuildPlan(planId);
  const OptionsEditor = getBuildPlanOptionsEditor(planId);

  const model = useMemo(
    () => (ddObject ? buildPlanModel(ddObject, inventoryEntries) : null),
    // dominoVersion is not read inside, but a change to it means the columns
    // buildPlanModel walks have been rewritten underneath us.
    [ddObject, inventoryEntries, dominoVersion],
  );

  // Swallows every keydown in the capture phase for the same reason
  // ConfirmDialog does: the window-level handlers behind this would otherwise go
  // on editing the element being printed. Only Escape is acted on, so Tab and
  // Enter still work the buttons.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key !== "Escape") return;
      e.preventDefault();
      closeBuildPlan();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [closeBuildPlan]);

  // Nothing to work from: the element was deleted, or has no dominoes. The menu
  // item is gated on the same thing, so this only shows if something changed
  // while the dialog was already up.
  if (!model) {
    return (
      <ConfirmDialog
        message="This element has no dominoes."
        cancelLabel="Close"
        onCancel={closeBuildPlan}
      />
    );
  }

  const output = () => {
    // Everything is already in memory, so this whole path is synchronous — which
    // it must be, or the browser stops seeing the click that led here and either
    // refuses the new tab or distrusts the download.
    const failure = definition.deliver(definition.render(model, options), model);
    if (failure) {
      setFailureMessage(failure);
      return;
    }
    closeBuildPlan();
  };

  const Icon = definition.icon;

  return (
    <>
      <div className={styles.scrim} onClick={closeBuildPlan} />
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={definition.title}
      >
        <div className={styles.header}>
          <Icon className={styles.headerIcon} size={18} />
          <h2 className={styles.title}>
            {definition.title} — {model.ddObjectName}
          </h2>
        </div>
        <div className={styles.body}>
          <OptionsEditor
            model={model}
            options={options}
            update={(patch) => setBuildPlanOptions(planId, patch as object)}
          />
        </div>
        <div className={styles.footer}>
          <button className={styles.button} onClick={closeBuildPlan}>
            Cancel
          </button>
          <button className={`${styles.button} ${styles.primary}`} onClick={output}>
            {definition.actionLabel}
          </button>
        </div>
      </div>
      {failureMessage && (
        <ConfirmDialog
          message={failureMessage}
          cancelLabel="Close"
          onCancel={() => setFailureMessage(null)}
        />
      )}
    </>
  );
}