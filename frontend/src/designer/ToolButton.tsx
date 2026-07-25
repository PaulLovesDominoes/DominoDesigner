import type { RemixiconComponentType } from "@remixicon/react";

import styles from "./Toolbar.module.css";

interface Props {
  label: string;
  Icon: RemixiconComponentType;
  active: boolean;
  onClick: () => void;
}

export default function ToolButton({ label, Icon, active, onClick }: Props) {
  return (
    <button
      className={active ? `${styles.iconBtn} ${styles.active}` : styles.iconBtn}
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
    >
      <Icon size={20} />
    </button>
  );
}
