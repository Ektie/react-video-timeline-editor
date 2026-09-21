import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const src = join(dirname(fileURLToPath(import.meta.url)), "../src");
const forbidden = [
    "NetworkProvider",
    "EktieUI",
    "creative-studio/",
    "manage.creative",
    "brand-kit",
    "process.env",
    "attachMedia",
    "checkpointGate",
];

function walk(dir, files = []) {
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full, files);
        else files.push(full);
    }
    return files;
}

describe("no private host coupling", () => {
    it("does not import Ektie APIs, env, or product modules", () => {
        const hits = [];
        for (const file of walk(src)) {
            const text = readFileSync(file, "utf8");
            for (const token of forbidden) {
                if (text.includes(token)) hits.push(`${file}: ${token}`);
            }
        }
        assert.deepEqual(hits, []);
    });
});
