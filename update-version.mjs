import fs from "fs";

// Ported from DayTime Tracker's update-version.js (ref_docs/TODO.md Phase 7)
// — kept as .mjs here (rather than DayTime Tracker's plain .js) since this
// package.json doesn't set "type": "module"; a plain .js file would be
// parsed as CommonJS and fail on the `import` syntax below.

// Usage: node update-version.mjs [changelogEntry]
//   - Reads the new version from package.json.
//   - If changelogEntry is provided, inserts a new changelog section under
//     README.md's "## Changelog" heading, above the latest entry.

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

// 4. Optionally insert a changelog entry into README.md.
const changelogEntry = process.argv[2];
if (changelogEntry) {
	const readmePath = "README.md";
	if (!fs.existsSync(readmePath)) {
		console.error(`Error: ${readmePath} not found`);
		process.exit(1);
	}

	const today = new Date().toISOString().split("T")[0];
	const heading = `### ${newVersion} (${today})`;

	const lines = fs.readFileSync(readmePath, "utf8").split("\n");

	const changelogIdx = lines.findIndex((line) => line.trim() === "## Changelog");
	if (changelogIdx === -1) {
		console.error(`Error: No "## Changelog" section found in ${readmePath}`);
		process.exit(1);
	}

	// Find the first "### " heading after "## Changelog" — that's the latest entry.
	let insertIdx = changelogIdx + 1;
	while (insertIdx < lines.length && !lines[insertIdx].startsWith("### ")) insertIdx++;

	const newSection = [
		"",
		heading,
		"",
		...changelogEntry.split("\n"),
		"",
	];

	lines.splice(insertIdx, 0, ...newSection);

	fs.writeFileSync(readmePath, lines.join("\n"));
	console.log(`Updated ${readmePath}: added changelog entry for ${newVersion}`);
}
