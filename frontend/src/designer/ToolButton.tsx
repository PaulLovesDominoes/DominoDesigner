import type { RemixiconComponentType } from "@remixicon/react";

import styles from "./Toolbar.module.css";

interface Props {
  label: string;
  Icon: RemixiconComponentType;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}

export default function ToolButton({ label, Icon, active, onClick, disabled }: Props) {
  return (
    <button
      className={active ? `${styles.iconBtn} ${styles.active}` : styles.iconBtn}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
    >
      <Icon size={20} />
    </button>
  );
}
