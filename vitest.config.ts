import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "apps/desktop",
      "packages/*",
      {
        test: {
          name: "scripts",
          environment: "node",
          include: ["scripts/**/*.test.mjs"],
          testTimeout: 20000,
        },
      },
    ],
  },
});
