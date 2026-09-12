import { defineConfig, mergeConfig } from "vite";
import config from "../vite.config";
export default mergeConfig(
  config,
  defineConfig({
    build: {
      outDir: ".tmp/runtime-fixture-build",
      rollupOptions: { input: "scripts/runtime-fixture.html" },
    },
  })
);
