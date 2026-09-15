/// <reference types="vitest" />
import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";
import tsconfigPaths from "vite-tsconfig-paths";
import fs from "fs";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [tsconfigPaths(), {
    name: "channel-client switcher",
    load:  (id) => {
      if (process.env.YAAGL_LOCAL_BUILD === "1" && id.endsWith("/src/clients/mhy/hk4e/fps-bridge-manifest.ts")) {
        return fs.readFileSync(path.resolve(".tmp/build-fps-bridge-manifest.ts"), "utf8");
      }
      if(id.endsWith("/src/clients/index.ts")) {
        const cc = process.env["YAAGL_CHANNEL_CLIENT"] ?? "hk4ecn";
        console.info(`Building channel client ${cc}`);
        return `export * from './${cc}'`;
      }
      return null;
    }
  }, solidPlugin()],

  // Build output/tool paths are host-only inputs, never frontend settings.
  envPrefix: ["VITE_", "YAAGL_CHANNEL_CLIENT", "YAAGL_VERSION", "YAAGL_ADVANCED_ENABLE"],
  build: {
    target: "safari13",
    minify: true,
    sourcemap: false,
    outDir: "dist",
    rollupOptions: {},
  },
  test: {
    include: ["src/**/*.spec.ts"],
    environment: "node",
  },
});
