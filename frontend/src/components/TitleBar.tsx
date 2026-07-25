import { RiMenuLine, RiQuestionLine } from "@remixicon/react";

import { useStore } from "../store";
import HamburgerMenu from "./HamburgerMenu";
import HelpPanel from "./HelpPanel";
import styles from "./TitleBar.module.css";
import logo from "../assets/logo-small.png";

export default function TitleBar() {
  const toggleMenu = useStore((s) => s.toggleMenu);
  const toggleHelp = useStore((s) => s.toggleHelp);

  return (
    <header className={styles.bar}>
      <button
        className={styles.menuButton}
        onClick={toggleMenu}
        title="Open menu"
        aria-label="Open menu"
      >
        <RiMenuLine size={22} />
      </button>

      <HamburgerMenu />

      <div className={styles.logo}>
        {/* Placeholder for the DominoDesigner logo image (no asset yet). */}
        <div
          className={styles.logoPlaceholder}
          aria-label="DominoDesigner logo placeholder"
        >
          <img src={logo} aria-label="DominoDesigner logo" title="Domino Designer"/>
        </div>
        {/* <span className={styles.title}>DominoDesigner</span> */}
      </div>

      <button
        className={styles.helpButton}
        onClick={toggleHelp}
        title="Open help"
        aria-label="Open help"
      >
        <RiQuestionLine size={22} />
      </button>

      <HelpPanel />
    </header>
  );
}
