import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { initDominoData } from "./dominoes/store";
import { initDominoSelectionPruning } from "./dominoes/selectionStore";
import { initDominoColorMemoryPruning } from "./dominoes/colorMemory";
import { initColorLookup } from "./domino-inventory/colorLookupStore";
import "./global.css";

// Must run before the first render: it is what frees an element's dominoes (and
// its domino selection, and its cross-regenerate color memory) when the
// element is deleted, and what keeps the domino-color lookup table in sync
// with the inventory. See initDominoData for why these aren't module-load
// side effects.
initDominoData();
initDominoSelectionPruning();
initDominoColorMemoryPruning();
initColorLookup();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
