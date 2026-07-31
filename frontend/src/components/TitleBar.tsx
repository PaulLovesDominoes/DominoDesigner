import { RiMenuLine, RiQuestionLine } from "@remixicon/react";

import { useStore } from "../store";
import HamburgerMenu from "./HamburgerMenu";
import HelpPanel from "./HelpPanel";
import Toolbar from "../designer/Toolbar";
import styles from "./TitleBar.module.css";
import logo from "../assets/logo-small.png";

export default function TitleBar() {
  const toggleMenu = useStore((s) => s.toggleMenu);
  const toggleHelp = useStore((s) => s.toggleHelp);

  return (
    <header className={styles.bar}>
      {/* Fixed to --sidebar-width so .toolbarSection's left edge lines up
          with the canvas area's left edge below it (Sidebar occupies the
          same width on that row). */}
      <div className={styles.brand}>
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
      </div>

      <div className={styles.toolbarSection}>
        {/* Designer-only; renders null on other screens (Toolbar.tsx's own
            screen gate). Help stays put via its own margin-left: auto below,
            which is what keeps it flush-right even when Toolbar is absent. */}
        <Toolbar />

        <button
          className={styles.helpButton}
          onClick={toggleHelp}
          title="Open help"
          aria-label="Open help"
        >
          <RiQuestionLine size={22} />
        </button>

        <HelpPanel />
      </div>
    </header>
  );
}
