import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { initDominoData } from "./dominoes/store";
import { initDominoSelectionPruning } from "./dominoes/selectionStore";
import "./global.css";

// Must run before the first render: it is what frees an element's dominoes (and
// its domino selection) when the element is deleted. See initDominoData for why
// this isn't a module-load side effect.
initDominoData();
initDominoSelectionPruning();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
