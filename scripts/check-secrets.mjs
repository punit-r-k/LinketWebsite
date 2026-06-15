import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const textExtensions = new Set([
  ".cjs",
  ".css",
  ".env",
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
const patterns = [
  { name: "AWS key", regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "GitHub token", regex: /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/g },
  { name: "Slack token", regex: /\bxox[baprs]-[A-Za-z0-9-]{10,255}\b/g },
  { name: "Stripe secret", regex: /\bsk_(live|test)_[A-Za-z0-9]{16,255}\b/g },
  { name: "Private key", regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { name: "Supabase service role", regex: /\bsb_secret_[A-Za-z0-9]{20,255}\b/g },
];
const allowListFiles = new Set(["SECURITY.md"]);

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

const findings = [];

for (const relativePath of getTrackedFiles()) {
  if (!textExtensions.has(path.extname(relativePath).toLowerCase())) continue;
  if (allowListFiles.has(relativePath)) continue;
  const absolutePath = path.join(projectRoot, relativePath);
  if (!fs.existsSync(absolutePath)) continue;
  const contents = fs.readFileSync(absolutePath, "utf8");
  for (const pattern of patterns) {
    if (pattern.regex.test(contents)) {
      findings.push({ file: relativePath, name: pattern.name });
      break;
    }
  }
}

if (findings.length > 0) {
  console.error("Potential secrets detected:");
  findings.forEach((finding) =>
    console.error(` - ${finding.file}: ${finding.name}`)
  );
  process.exit(1);
}
