#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const airtableDir = path.join(repoRoot, "src", "lib", "airtable");
const modulesDir = path.join(repoRoot, "src", "modules");
const squareProviderDir = path.join(repoRoot, "src", "lib", "providers", "square");

const allowedLibFiles = new Set(["client.ts", "types.ts", "errors.ts"]);
const errors = [];

const libFiles = fs.readdirSync(airtableDir).filter((name) => name.endsWith(".ts"));
for (const file of libFiles) {
  if (!allowedLibFiles.has(file)) {
    errors.push(`Disallowed file in src/lib/airtable: ${file}`);
  }
}

for (const file of libFiles) {
  const fullPath = path.join(airtableDir, file);
  const content = fs.readFileSync(fullPath, "utf8");
  if (/_TABLE\b/.test(content)) {
    errors.push(`Found table constant in infra-only file: src/lib/airtable/${file}`);
  }
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;

    const content = fs.readFileSync(full, "utf8");
    const lines = content.split(/\r?\n/);
    lines.forEach((line, idx) => {
      const match = line.match(/@\/lib\/airtable\/([a-zA-Z0-9-]+)/);
      if (!match) return;
      const importTarget = `${match[1]}.ts`;
      if (allowedLibFiles.has(importTarget)) return;
      const rel = path.relative(repoRoot, full).replace(/\\/g, "/");
      errors.push(`Disallowed modules import (${rel}:${idx + 1}): ${line.trim()}`);
    });
  }
}

walk(modulesDir);

function walkSquareProviders(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkSquareProviders(full);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;

    const content = fs.readFileSync(full, "utf8");
    const lines = content.split(/\r?\n/);
    lines.forEach((line, idx) => {
      if (!line.includes("@/modules/")) return;
      const rel = path.relative(repoRoot, full).replace(/\\/g, "/");
      errors.push(
        `Disallowed provider import (${rel}:${idx + 1}): ${line.trim()}`,
      );
    });
  }
}

walkSquareProviders(squareProviderDir);

if (errors.length > 0) {
  console.error("Airtable boundary check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Airtable boundary check passed.");
