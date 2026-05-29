import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const lighthousePath = path.join(root, "lighthouse-accessibility.json");
const axePath = path.join(root, "axe-accessibility.json");

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required file: ${path.basename(filePath)}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function formatScore(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return "n/a";
  return `${Math.round(value * 100)}%`;
}

function run() {
  let failed = false;

  const lighthouse = readJson(lighthousePath);
  const axe = readJson(axePath);

  const accessibilityCategory = lighthouse?.categories?.accessibility;
  const score = accessibilityCategory?.score;
  if (typeof score !== "number" || score < 1) {
    failed = true;
    console.error(
      `[a11y] Lighthouse accessibility score is ${formatScore(score)} (expected 100%).`
    );
  }

  const auditRefs = accessibilityCategory?.auditRefs ?? [];
  const failingAudits = auditRefs
    .map((ref) => ref?.id)
    .filter((id) => typeof id === "string")
    .map((id) => lighthouse?.audits?.[id])
    .filter((audit) => audit && typeof audit.score === "number" && audit.score < 1);

  if (failingAudits.length > 0) {
    const seriousFailingAudits = failingAudits.filter((audit) => {
      const impact = audit?.details?.debugData?.impact;
      return impact === "serious" || impact === "critical";
    });
    if (seriousFailingAudits.length > 0) {
      failed = true;
      console.error("[a11y] Lighthouse has serious accessibility failures:");
      for (const audit of seriousFailingAudits.slice(0, 10)) {
        console.error(`- ${audit.id}: ${audit.title}`);
      }
    } else {
      console.warn("[a11y] Lighthouse has non-blocking accessibility warnings:");
      for (const audit of failingAudits.slice(0, 10)) {
        console.warn(`- ${audit.id}: ${audit.title}`);
      }
    }
  }

  const violations = Array.isArray(axe?.violations) ? axe.violations : [];
  if (violations.length > 0) {
    failed = true;
    console.error(`[a11y] axe reported ${violations.length} violation(s):`);
    for (const violation of violations.slice(0, 10)) {
      console.error(`- ${violation.id}: ${violation.help}`);
    }
  }

  const navbarPath = path.join(root, "src", "components", "site", "navbar.tsx");
  if (!fs.existsSync(navbarPath)) {
    failed = true;
    console.error("[a11y] Missing src/components/site/navbar.tsx");
  } else {
    const navbarSource = fs.readFileSync(navbarPath, "utf8");
    const hasSignInLabel = /aria-label="Sign in"/.test(navbarSource);
    const hasVisibleSignInText = /<Link href="\/auth\?view=signin">Sign in<\/Link>/.test(
      navbarSource
    );
    if (!hasSignInLabel || !hasVisibleSignInText) {
      failed = true;
      console.error(
        "[a11y] Sign in control label regression detected in navbar.tsx."
      );
    }
  }

  if (failed) {
    process.exitCode = 1;
    return;
  }

  console.log("[a11y] Accessibility baselines passed.");
}

try {
  run();
} catch (error) {
  console.error(
    `[a11y] ${error instanceof Error ? error.message : "Unknown error"}`
  );
  process.exitCode = 1;
}
