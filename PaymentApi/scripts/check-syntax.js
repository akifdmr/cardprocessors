const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const ignoredDirs = new Set([".git", ".tmp", "node_modules"]);
const ignoredPaths = new Set([
  path.join(rootDir, "public", "react")
]);
const jsFiles = [];

function collectJsFiles(dir) {
  if (ignoredPaths.has(dir)) {
    return;
  }

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectJsFiles(fullPath);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".js")) {
      jsFiles.push(fullPath);
    }
  }
}

collectJsFiles(rootDir);
jsFiles.sort();

for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ["--check", file], {
    encoding: "utf8"
  });

  if (result.status !== 0) {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    process.exit(result.status || 1);
  }
}

console.log(`Syntax check passed for ${jsFiles.length} JavaScript files.`);
