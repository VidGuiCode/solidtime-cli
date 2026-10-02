import { readFileSync } from "node:fs";

// Print the CHANGELOG.md section for a version ("0.2.0"), used by the release
// workflow as the release notes. Exits 1 when the section does not exist so
// the workflow can fall back to auto-generated notes.

const version = process.argv[2];
if (!version) {
  console.error("usage: node scripts/extract-release-notes.mjs <version>");
  process.exit(1);
}

const changelog = readFileSync("CHANGELOG.md", "utf-8");
const lines = changelog.split("\n");
const start = lines.findIndex((line) => line.trim() === `## ${version}`);
if (start === -1) {
  console.error(`No "## ${version}" section found in CHANGELOG.md`);
  process.exit(1);
}

let end = lines.length;
for (let i = start + 1; i < lines.length; i++) {
  if (/^## /.test(lines[i])) {
    end = i;
    break;
  }
}

process.stdout.write(lines.slice(start, end).join("\n").trim() + "\n");
