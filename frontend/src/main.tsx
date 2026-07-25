import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { initDominoData } from "./dominoes/store";
import "./global.css";

// Must run before the first render: it is what frees an element's dominoes when
// the element is deleted. See initDominoData for why it isn't a module-load
// side effect.
initDominoData();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
