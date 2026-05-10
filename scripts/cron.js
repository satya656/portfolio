#!/usr/bin/env node
/**
 * cron.js
 * Schedules weekly blog post generation every Monday at 8:00 AM.
 *
 * Usage:
 *   node scripts/cron.js
 *
 * Alternatively, add to system crontab:
 *   0 8 * * 1 cd /path/to/ai-pm-blog && node scripts/generate-post.js >> logs/generation.log 2>&1
 */

import cron from "node-cron";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = path.join(__dirname, "..", "logs");
const GENERATE_SCRIPT = path.join(__dirname, "generate-post.js");

fs.mkdirSync(LOGS_DIR, { recursive: true });

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(path.join(LOGS_DIR, "generation.log"), line + "\n");
}

log("🕐 Cron scheduler started. Will generate posts every Monday at 8:00 AM.");
log(`   Script: ${GENERATE_SCRIPT}`);

// Every Monday at 8:00 AM
// Cron syntax: minute hour day-of-month month day-of-week
// day-of-week: 1 = Monday
cron.schedule("0 8 * * 1", () => {
  log("⏰ Scheduled trigger fired — generating weekly post...");

  execFile("node", [GENERATE_SCRIPT], { env: process.env }, (err, stdout, stderr) => {
    if (err) {
      log(`❌ Generation failed: ${err.message}`);
      if (stderr) log(`STDERR: ${stderr}`);
    } else {
      log("✅ Generation completed successfully.");
      if (stdout) stdout.split("\n").filter(Boolean).forEach((l) => log(`  OUT: ${l}`));
    }
  });
});

// Keep process alive
process.on("SIGINT", () => {
  log("Cron scheduler stopped.");
  process.exit(0);
});
