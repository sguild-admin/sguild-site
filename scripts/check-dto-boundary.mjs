#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const repoRoot = process.cwd();
const modulesDir = path.join(repoRoot, "src", "modules");
const errors = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!entry.isFile() || entry.name !== "dto.ts") continue;
    checkDtoFile(full);
  }
}

function fail(filePath, node, reason) {
  const rel = path.relative(repoRoot, filePath).replace(/\\/g, "/");
  const source = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  errors.push(`${rel}:${line + 1}:${character + 1} ${reason}`);
}

function checkDtoFile(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);

  for (const stmt of sourceFile.statements) {
    if (ts.isImportDeclaration(stmt)) {
      const clause = stmt.importClause;
      if (!clause || !clause.isTypeOnly) {
        fail(filePath, stmt, "dto.ts may only use `import type` declarations.");
      }
      continue;
    }

    if (ts.isTypeAliasDeclaration(stmt) || ts.isInterfaceDeclaration(stmt)) {
      continue;
    }

    if (ts.isExportDeclaration(stmt)) {
      if (!stmt.isTypeOnly) {
        fail(filePath, stmt, "dto.ts may only use `export type` re-exports.");
      }
      continue;
    }

    fail(
      filePath,
      stmt,
      "dto.ts must contain types/interfaces only (no runtime values or executable logic).",
    );
  }
}

walk(modulesDir);

if (errors.length > 0) {
  console.error("DTO boundary check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("DTO boundary check passed.");
