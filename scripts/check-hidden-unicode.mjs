import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const bidiOrHiddenPattern =
  /[\u202A-\u202E\u2066-\u2069\u200B-\u200F\u061C\uFEFF]/u;
const projectRoot = path.resolve(import.meta.dirname, "..");
const textExtensions = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".sql",
  ".svg",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

function getTrackedFiles() {
  try {
    const output = execFileSync("git", ["ls-files", "-z"], {
      cwd: projectRoot,
      encoding: "utf8",
    });
    return output.split("\0").filter(Boolean);
  } catch {
    return walkFiles(projectRoot).map((absolutePath) =>
      path.relative(projectRoot, absolutePath)
    );
  }
}

function walkFiles(root) {
  const out = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === ".git" || entry.name === ".next" || entry.name === "node_modules") {
        continue;
      }
      const nextPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(nextPath);
      } else {
        out.push(nextPath);
      }
    }
  }
  return out;
}

const offenders = [];

for (const relativePath of getTrackedFiles()) {
  if (!textExtensions.has(path.extname(relativePath).toLowerCase())) continue;
  const absolutePath = path.join(projectRoot, relativePath);
  if (!fs.existsSync(absolutePath)) continue;
  const contents = fs.readFileSync(absolutePath, "utf8").replace(/^\uFEFF/u, "");
  if (bidiOrHiddenPattern.test(contents)) {
    offenders.push(relativePath);
  }
}

if (offenders.length > 0) {
  console.error("Hidden or bidirectional Unicode detected:");
  offenders.forEach((filePath) => console.error(` - ${filePath}`));
  process.exit(1);
}
