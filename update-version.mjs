import fs from "fs";

// Ported from DayTime Tracker's update-version.js (ref_docs/TODO.md Phase 7)
// — kept as .mjs here (rather than DayTime Tracker's plain .js) since this
// package.json doesn't set "type": "module"; a plain .js file would be
// parsed as CommonJS and fail on the `import` syntax below.

// 1. Read the new version from package.json.
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const newVersion = pkg.version;

if (!newVersion) {
	console.error("Error: Could not find version in package.json");
	process.exit(1);
}

// 2. Update the version in manifest.json.
const manifestPath = "manifest.json";
if (fs.existsSync(manifestPath)) {
	const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
	const oldVersion = manifest.version;
	manifest.version = newVersion;
	fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, "\t") + "\n");
	console.log(`Updated manifest.json: ${oldVersion} -> ${newVersion}`);
} else {
	console.error("Error: manifest.json not found");
	process.exit(1);
}

// 3. Add a new-version compatibility mapping to versions.json.
const versionsPath = "versions.json";
if (fs.existsSync(versionsPath)) {
	const versions = JSON.parse(fs.readFileSync(versionsPath, "utf8"));
	const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

	// Map the new version to the minimum supported version from the current manifest.
	versions[newVersion] = manifest.minAppVersion || "0.15.0";

	fs.writeFileSync(versionsPath, JSON.stringify(versions, null, "\t") + "\n");
	console.log(`Updated versions.json with version ${newVersion}`);
} else {
	console.error("Error: versions.json not found");
	process.exit(1);
}
