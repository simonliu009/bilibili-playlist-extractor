#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const scriptPath = path.join(__dirname, "generate-icons.py");
const result = spawnSync("python3", [scriptPath], {
  stdio: "inherit",
  env: {
    ...process.env,
    PYTHONDONTWRITEBYTECODE: "1"
  }
});

process.exit(result.status ?? 1);
