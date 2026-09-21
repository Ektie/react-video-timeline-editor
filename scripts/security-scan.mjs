#!/usr/bin/env node
/**
 * Public-repo security scan. Fails on likely secrets or Ektie private config.
 */
import { execSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SKIP = new Set(["node_modules", ".git", ".next", "dist", "coverage", "playwright-report"]);

const PATTERNS = [
    /API_KEY/i,
    /PRIVATE_KEY/i,
    /DATABASE_URL/i,
    /\bAWS_/,
    /\bGCP_/,
    /\bAZURE_/,
    /\bOPENAI_/,
    /\bANTHROPIC_/,
    /\bSTRIPE_/,
    /DIGITALOCEAN/i,
    /process\.env/,
    /NEXT_PUBLIC_/,
    /NetworkProvider/,
    /EktieUI/,
    /creative-studio\//,
    /brand-kit/,
    /manage\.creative/,
    /APP_KEY=/,
    /sk-[a-zA-Z0-9]{20,}/,
    /eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]+\./,
];

const ALLOW_FILES = new Set([
    "scripts/security-scan.mjs",
    "packages/editor/tests/noHostCoupling.test.js",
    "docs/SECURITY-AUDIT.md",
    "CONTRIBUTING.md",
    "NOTICE",
    "README.md",
    "docs/architecture.md",
    "docs/nextjs.md",
    "docs/ektie.md",
    "demo/nextjs/components/EditorDemo.js",
]);

function walk(dir, files = []) {
    for (const name of readdirSync(dir)) {
        if (SKIP.has(name)) continue;
        const full = join(dir, name);
        const stat = statSync(full);
        if (stat.isDirectory()) walk(full, files);
        else files.push(full);
    }
    return files;
}

const hits = [];
for (const file of walk(ROOT)) {
    const rel = relative(ROOT, file);
    if (ALLOW_FILES.has(rel)) continue;
    if (/\.(png|jpg|jpeg|mp4|wav|woff2|lock)$/i.test(rel)) continue;
    let text;
    try {
        text = readFileSync(file, "utf8");
    } catch {
        continue;
    }
    for (const pattern of PATTERNS) {
        if (pattern.test(text)) {
            hits.push({ file: rel, pattern: String(pattern) });
        }
    }
}

let gitLog = "";
try {
    gitLog = execSync("git log --all --full-history --oneline", { encoding: "utf8" });
} catch {
    gitLog = "(no git log)";
}

console.log("Security scan");
console.log("files checked:", walk(ROOT).length);
console.log("pattern hits:", hits.length);
hits.forEach((hit) => console.log(" -", hit.file, hit.pattern));
console.log("git history:\n" + gitLog);

if (hits.length) {
    process.exit(1);
}
