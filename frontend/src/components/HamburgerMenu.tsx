import { useStore } from "../store";
import type { ScreenId } from "../types";
import styles from "./HamburgerMenu.module.css";

// Menu entries. Add a screen by adding an item here and registering the
// component in SCREENS (App.tsx).
const MENU_ITEMS: { id: ScreenId; label: string }[] = [
  { id: "settings", label: "Settings" },
  { id: "designer", label: "Designer" },
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
        {MENU_ITEMS.map((item) => (
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
