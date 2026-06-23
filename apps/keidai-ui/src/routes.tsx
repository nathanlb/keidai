import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "./App.js";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
  },
]);
