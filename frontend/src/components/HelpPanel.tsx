import { useEffect, useRef, useState } from "react";
import { RiArrowLeftLine, RiCloseLine, RiHomeLine } from "@remixicon/react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";

import { useStore } from "../store";
import { HOME_TOPIC, topicForScreen } from "../help/registry";
import { HELP_TOPICS } from "../help/topics";
import styles from "./HelpPanel.module.css";

const EXTERNAL_LINK = /^([a-z][a-z0-9+.-]*:|\/\/)/i;

export default function HelpPanel() {
  const helpOpen = useStore((s) => s.helpOpen);
  const closeHelp = useStore((s) => s.closeHelp);
  const screen = useStore((s) => s.screen);

  const [topicStack, setTopicStack] = useState<string[]>([HOME_TOPIC]);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (helpOpen && !wasOpen.current) {
      setTopicStack([topicForScreen(screen)]);
    }
    wasOpen.current = helpOpen;
  }, [helpOpen, screen]);

  if (!helpOpen) return null;

  const currentId = topicStack[topicStack.length - 1];
  const topic = HELP_TOPICS[currentId] ?? HELP_TOPICS[HOME_TOPIC];

  const navigate = (id: string) => {
    if (id === currentId || !HELP_TOPICS[id]) return;
    setTopicStack((stack) => [...stack, id]);
  };

  const goBack = () => setTopicStack((stack) => stack.slice(0, -1));
  const goHome = () => navigate(HOME_TOPIC);

  const components: Components = {
    a: ({ href, children }) => {
      const targetId = href?.replace(/\.md$/, "");
      if (targetId && !EXTERNAL_LINK.test(targetId) && HELP_TOPICS[targetId]) {
        return (
          <a
            href={href}
            onClick={(e) => {
              e.preventDefault();
              navigate(targetId);
            }}
          >
            {children}
          </a>
        );
      }
      return (
        <a href={href} target="_blank" rel="noreferrer">
          {children}
        </a>
      );
    },
  };

  return (
    <div className={styles.backdrop} onClick={closeHelp}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <button
            className={styles.iconButton}
            onClick={goBack}
            disabled={topicStack.length <= 1}
            aria-label="Back"
            title="Back"
          >
            <RiArrowLeftLine size={18} />
          </button>
          <button
            className={styles.iconButton}
            onClick={goHome}
            disabled={currentId === HOME_TOPIC}
            aria-label="Help home"
            title="Help home"
          >
            <RiHomeLine size={18} />
          </button>
          <h2 className={styles.title}>{topic?.title ?? "Help"}</h2>
          <button
            className={styles.iconButton}
            onClick={closeHelp}
            aria-label="Close help"
            title="Close"
          >
            <RiCloseLine size={18} />
          </button>
        </div>
        <div className={styles.body}>
          <ReactMarkdown components={components}>{topic?.body ?? ""}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
