import type { ComponentType } from "react";

import PropertiesDialog from "./components/PropertiesDialog";
import TitleBar from "./components/TitleBar";
import DesignerScreen from "./screens/DesignerScreen";
import DominoInventoryScreen from "./screens/DominoInventoryScreen";
import { useStore } from "./store";
import type { ScreenId } from "./types";

// Screen registry — add a screen by adding an entry here and to MENU_ITEMS
// in HamburgerMenu.
const SCREENS: Record<ScreenId, ComponentType> = {
  designer: DesignerScreen,
  dominoInventory: DominoInventoryScreen,
};

export default function App() {
  const screen = useStore((s) => s.screen);
  const ActiveScreen = SCREENS[screen];

  return (
    <>
      <TitleBar />
      <div className="app-content">
        <ActiveScreen />
      </div>
      {/* Mounted above every screen so it can be dragged anywhere on
          screen, clear of the sidebar's and canvas area's clipping. */}
      <PropertiesDialog />
    </>
  );
}
