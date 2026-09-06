import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // The studio deliberately drives Three.js refs and material/camera state
      // from render-loop callbacks. These React Compiler rules mistake that
      // external imperative scene graph for React-owned mutable state.
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
      // Existing UI state synchronization and local render helpers are valid in
      // this non-compiled app; retain rules-of-hooks and exhaustive-deps below.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/static-components": "off",
    },
  },
  globalIgnores([
    ".next/**",
    ".pglite*/**",
    ".render/**",
    ".claude/**",
    "out/**",
    "build/**",
    "storage*/**",
    "test-results/**",
    "public/**",
    "design_enhancements/**",
    "next-env.d.ts",
    "contracts/lib/**",
    "contracts/out/**",
    "contracts/cache/**",
    "drizzle/meta/**",
  ]),
]);
