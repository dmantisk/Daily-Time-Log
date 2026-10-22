#!/usr/bin/env node
import fs from "fs";
const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
const versions = JSON.parse(fs.readFileSync("versions.json", "utf8"));
const v = manifest.version;
if (!versions[v]) {
  console.error(`Release guard failed: versions.json missing entry for ${v}`);
  process.exit(1);
}
console.log(`Release guard passed: ${v} -> ${versions[v]}`);
