import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    files: ["src/modules/**/service.ts", "src/modules/**/*.service.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/airtable/*"],
              message:
                "Services must not import Airtable table modules directly. Use module repos/ports instead.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/modules/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/lib/airtable/*",
                "!@/lib/airtable/client",
                "!@/lib/airtable/types",
                "!@/lib/airtable/errors",
              ],
              message:
                "Modules may only import generic Airtable infra from lib/airtable (client/types/errors).",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/modules/**/service",
                "@/modules/**/dto",
                "@/modules/**/schema",
                "@/modules/**/repo",
                "@/modules/**/ports",
              ],
              message:
                "Cross-module imports must use the module boundary (`@/modules/<module>`) instead of deep internal paths.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/lib/providers/square/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/modules/**"],
              message:
                "Square provider adapters must remain module-agnostic and must not import module code.",
            },
          ],
        },
      ],
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
