#!/usr/bin/env node
// Builds the static site for GitHub Pages into ./dist. No dependencies.

const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "dist");
const FILES = ["index.html", "style.css", "launcher.js", "favicon.svg", "WorldDomination1.swf"];

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT);

for (const file of FILES) {
  fs.copyFileSync(path.join(__dirname, file), path.join(OUT, file));
  console.log(`  ${file}`);
}

// Serve files as-is; skip Jekyll processing on GitHub Pages.
fs.writeFileSync(path.join(OUT, ".nojekyll"), "");

console.log(`Built ${FILES.length} files into ${path.relative(process.cwd(), OUT) || "."}/`);
