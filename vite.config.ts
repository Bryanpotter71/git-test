import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/short-rate-calc/" : "/",
  plugins: [react()],
  test: {
    globals: true,
    environment: "node"
  }
}));
