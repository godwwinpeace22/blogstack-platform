import * as React from "react";
import * as ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";

import { createRouter } from "./router";
import "./styles/globals.css";

const router = createRouter();
const container = document.getElementById("app");

if (!container) {
  throw new Error("Missing root element #app");
}

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
