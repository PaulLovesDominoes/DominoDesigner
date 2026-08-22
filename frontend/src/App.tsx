import type { ComponentType } from "react";

import BuildPlanDialog from "./build-plan/BuildPlanDialog";
import PropertiesDialog from "./components/PropertiesDialog";
import TitleBar from "./components/TitleBar";
import DesignerScreen from "./designer/DesignerScreen";
import DominoInventoryScreen from "./domino-inventory/DominoInventoryScreen";
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

export default function App() {
  const screen = useStore((s) => s.screen);
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
    </>
  );
}
