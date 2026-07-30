import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/ibm-plex-sans";
import "katex/dist/katex.min.css";
import "./styles.css";

createRoot(document.getElementById("root")).render(<App />);
