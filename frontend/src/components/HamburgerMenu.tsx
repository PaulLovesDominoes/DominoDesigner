import { useStore } from "../store";
import { STRUCTURE_DESIGNER_ENABLED } from "../structure-designer/enabled";
import type { ScreenId } from "../types";
import styles from "./HamburgerMenu.module.css";

interface MenuItem {
  id: ScreenId;
  label: string;
  /**
   * Leave out for a screen that is always available. Set false to keep a
   * screen out of the menu — how a screen still being built is hidden from a
   * published version of the app.
   */
  enabled?: boolean;
}

// Menu entries. Add a screen by adding an item here and registering the
// component in SCREENS (App.tsx).
const MENU_ITEMS: MenuItem[] = [
  { id: "dominoInventory", label: "Domino Inventory" },
  { id: "designer", label: "Designer" },
  {
    id: "structureDesigner",
    label: "Structure Designer",
    enabled: STRUCTURE_DESIGNER_ENABLED,
  },
];

export default function HamburgerMenu() {
  const menuOpen = useStore((s) => s.menuOpen);
  const screen = useStore((s) => s.screen);
  const setScreen = useStore((s) => s.setScreen);
  const closeMenu = useStore((s) => s.closeMenu);

  if (!menuOpen) return null;

  return (
    <>
      <div className={styles.backdrop} onClick={closeMenu} />
      <nav className={styles.menu}>
        {MENU_ITEMS.filter((item) => item.enabled !== false).map((item) => (
          <button
            key={item.id}
            className={
              item.id === screen ? `${styles.item} ${styles.active}` : styles.item
            }
            onClick={() => {
              setScreen(item.id);
              closeMenu();
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </>
  );
}
