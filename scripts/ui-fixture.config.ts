import { defineConfig, mergeConfig } from "vite";
import config from "../vite.config";
export default mergeConfig(
  config,
  defineConfig({
    build: {
      outDir: ".tmp/ui-build",
      rollupOptions: { input: "scripts/ui-fixture.html" },
    },
  })
);
