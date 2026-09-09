import { useState, type ComponentType } from "react";

import BuildPlanDialog from "./build-plan/BuildPlanDialog";
import ConfirmDialog from "./components/ConfirmDialog";
import PropertiesDialog from "./components/PropertiesDialog";
import TitleBar from "./components/TitleBar";
import DesignerScreen from "./designer/DesignerScreen";
import DominoInventoryScreen from "./domino-inventory/DominoInventoryScreen";
import { IS_WEBKIT } from "./platform";
import { STRUCTURE_DESIGNER_ENABLED } from "./structure-designer/enabled";
import StructureDesignerScreen from "./structure-designer/StructureDesignerScreen";
import { useStore } from "./store";
import type { ScreenId } from "./types";

/**
 * Screen registry — add a screen by adding an entry here and to MENU_ITEMS in
 * HamburgerMenu. A screen component lives in its own feature's folder.
 *
 * Partial, because the Structure Designer's entry is only present when its
 * build flag is on. A screen missing from here has no way to be shown at all,
 * which is what makes the flag more than a hidden menu item.
 */
const SCREENS: Partial<Record<ScreenId, ComponentType>> = {
  designer: DesignerScreen,
  dominoInventory: DominoInventoryScreen,
  ...(STRUCTURE_DESIGNER_ENABLED
    ? { structureDesigner: StructureDesignerScreen }
    : {}),
};

/** Where to land if the stored screen has no entry above. */
const FALLBACK_SCREEN: ScreenId = "designer";

/**
 * Shown once to anyone on Apple's browser engine.
 *
 * The specific thing behind "may not work correctly" is printing: a build plan
 * asks for an exact page size, which that engine ignores, so the sheets come out
 * scaled or clipped and will not tile when taped together. Naming the symptom
 * rather than only the risk is what lets someone judge whether it affects them.
 */
const WEBKIT_NOTICE =
  "This software has not been tested in Safari, and some features may not work " +
  "correctly.\n\nOn an Apple computer we recommend using Chrome.";

export default function App() {
  const screen = useStore((s) => s.screen);
  // Raised at startup and never again this session. Local state mounted inline,
  // per ConfirmDialog's own convention — there is no shared session behind it,
  // just something to say and a button to dismiss it with. Nothing in this app
  // is persisted, so "once per session" needs no storage; a reload says it
  // again, which is the right amount of insistence for a warning about output
  // the user cannot see is wrong.
  //
  // Gated on the *engine*, not on IS_APPLE: Chrome and Firefox on a Mac print
  // these documents correctly, and telling a Chrome user to switch to Chrome
  // would teach them to dismiss this app's messages unread.
  const [webkitNoticeOpen, setWebkitNoticeOpen] = useState(IS_WEBKIT);
  // Nothing can select a hidden screen today, since the menu is the only way
  // in. The fallback is here so that if one ever could — a link into the app,
  // or a remembered screen from a previous session — it lands somewhere real
  // rather than on a blank page.
  const ActiveScreen = SCREENS[screen] ?? SCREENS[FALLBACK_SCREEN]!;

  return (
    <>
      <TitleBar />
      <div className="app-content">
        <ActiveScreen />
      </div>
      {/* Mounted above every screen so it can be dragged anywhere on
          screen, clear of the sidebar's and canvas area's clipping. */}
      <PropertiesDialog />
      {/* Alongside it rather than inside a screen, for the same reason: it is a
          modal over everything, not part of any one screen's layout. */}
      <BuildPlanDialog />
      {/* Acknowledge-only: no confirmLabel and no onConfirm, so the one button
          does what Escape and the scrim already do. */}
      {webkitNoticeOpen && (
        <ConfirmDialog
          message={WEBKIT_NOTICE}
          cancelLabel="Continue"
          onCancel={() => setWebkitNoticeOpen(false)}
        />
      )}
    </>
  );
}
