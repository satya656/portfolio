/**
 * server.js — Local server for the Blog dashboard.
 * Run: node server.js
 * Listens on http://localhost:3001
 *
 * Endpoints:
 *   POST /api/generate          — generate a new post (draft)
 *   POST /api/publish           — publish a post by slug  { slug }
 *   POST /api/regenerate        — rebuild all static HTML
 *   GET  /api/posts             — list all posts (JSON)
 */

import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { exec, spawn } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env
if (!process.env.ANTHROPIC_API_KEY) {
  const envFile = path.join(__dirname, ".env");
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, "utf-8").split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim();
    }
  }
}

const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : __dirname;
const POSTS_DIR = path.join(DATA_DIR, "posts");
const PORTFOLIO_CONTENT_FILE = path.join(DATA_DIR, "portfolio-content.json");
const SCHEDULE_FILE = path.join(DATA_DIR, "schedule.json");
const PORT = process.env.PORT || 3001;

// ── Basic Auth ─────────────────────────────────────────────────────────────────
const DASH_USER = process.env.DASHBOARD_USER || "admin";
const DASH_PASS = process.env.DASHBOARD_PASS || "changeme";

function requireAuth(req, res) {
  const header = req.headers["authorization"] || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    const [user, pass] = Buffer.from(encoded, "base64").toString().split(":");
    if (user === DASH_USER && pass === DASH_PASS) return true;
  }
  res.writeHead(401, { "Content-Type": "text/plain" });
  res.end("Unauthorized");
  return false;
}

// ── Schedule helpers ───────────────────────────────────────────────────────────
const DEFAULT_SCHEDULE = { enabled: false, startDate: "", endDate: "", frequencyPerDay: 1, type: "", topic: "", lastRun: null, nextRun: null };

function loadSchedule() {
  try { return { ...DEFAULT_SCHEDULE, ...JSON.parse(fs.readFileSync(SCHEDULE_FILE, "utf-8")) }; }
  catch { return { ...DEFAULT_SCHEDULE }; }
}

function saveScheduleFile(cfg) {
  fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(cfg, null, 2));
}

function calcNextRun(cfg, from = new Date()) {
  const intervalMs = (24 * 60 * 60 * 1000) / Math.max(1, cfg.frequencyPerDay);
  if (cfg.lastRun) return new Date(new Date(cfg.lastRun).getTime() + intervalMs).toISOString();
  if (cfg.startDate) {
    const start = new Date(cfg.startDate + "T09:00:00");
    if (start > from) return start.toISOString();
  }
  return new Date(from.getTime() + intervalMs).toISOString();
}

function spawnGenerate(type, topic) {
  const args = ["scripts/generate-post.js"];
  if (type) args.push(`--type=${type}`);
  if (topic) args.push(`--topic=${topic}`);
  const child = spawn("node", args, { cwd: __dirname, env: { ...process.env }, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", d => process.stdout.write(d));
  child.stderr.on("data", d => process.stderr.write(d));
  child.on("close", code => {
    if (code === 0) exec("node generate-blog.js", { cwd: __dirname }, err => { if (err) console.error("[regenerate]", err.message); });
    else console.error("[scheduler] generation failed, exit code", code);
  });
  return child;
}

// ── Scheduler ticker (checks every 60s) ───────────────────────────────────────
setInterval(() => {
  const cfg = loadSchedule();
  if (!cfg.enabled) return;
  const now = new Date();
  if (cfg.startDate && now < new Date(cfg.startDate + "T00:00:00")) return;
  if (cfg.endDate   && now > new Date(cfg.endDate   + "T23:59:59")) return;
  if (cfg.nextRun   && now < new Date(cfg.nextRun)) return;
  console.log("[scheduler] firing scheduled post generation");
  cfg.lastRun = now.toISOString();
  cfg.nextRun = calcNextRun({ ...cfg, lastRun: cfg.lastRun });
  saveScheduleFile(cfg);
  spawnGenerate(cfg.type, cfg.topic);
}, 60_000);

const MIME_TYPES = {
  ".html": "text/html", ".css": "text/css", ".js": "application/javascript",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".pdf": "application/pdf",
};

// ── CORS headers (allow file:// origin) ───────────────────────────────────────
function setCORS(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function json(res, status, data) {
  setCORS(res);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
  });
}

// ── Load all posts ─────────────────────────────────────────────────────────────
function loadAllPosts() {
  if (!fs.existsSync(POSTS_DIR)) return [];
  return fs.readdirSync(POSTS_DIR)
    .filter(f => f.endsWith(".json"))
    .sort().reverse()
    .map(f => {
      try {
        const post = JSON.parse(fs.readFileSync(path.join(POSTS_DIR, f), "utf-8"));
        post._filename = f;
        return post;
      } catch { return null; }
    })
    .filter(Boolean);
}

// ── Server ─────────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Preflight
  if (req.method === "OPTIONS") {
    setCORS(res);
    res.writeHead(204);
    res.end();
    return;
  }

  // POST /api/verify — checks credentials via JSON body
  if (req.method === "POST" && url.pathname === "/api/verify") {
    const body = await readBody(req);
    if (body.user === DASH_USER && body.pass === DASH_PASS) return json(res, 200, { ok: true });
    return json(res, 401, { ok: false });
  }

  // GET /api/portfolio is public — read by the main portfolio page
  const isPublic = req.method === "GET" && url.pathname === "/api/portfolio";

  // Protect all management API routes
  if (url.pathname.startsWith("/api/") && !isPublic && !requireAuth(req, res)) return;

  // GET /api/posts
  if (req.method === "GET" && url.pathname === "/api/posts") {
    return json(res, 200, { posts: loadAllPosts() });
  }

  // GET /api/schedule
  if (req.method === "GET" && url.pathname === "/api/schedule") {
    return json(res, 200, loadSchedule());
  }

  // POST /api/schedule
  if (req.method === "POST" && url.pathname === "/api/schedule") {
    const body = await readBody(req);
    const cfg = { ...DEFAULT_SCHEDULE, ...body };
    if (cfg.enabled && !cfg.nextRun) cfg.nextRun = calcNextRun(cfg);
    saveScheduleFile(cfg);
    return json(res, 200, { ok: true, schedule: cfg });
  }

  // POST /api/generate
  if (req.method === "POST" && url.pathname === "/api/generate") {
    const body = await readBody(req);
    const type = body.type || "";
    const tool = body.tool || "";
    const topic = body.topic || "";

    const args = ["scripts/generate-post.js"];
    if (type) args.push(`--type=${type}`);
    if (tool) args.push(`--tool=${tool}`);
    if (topic) args.push(`--topic=${topic}`);

    console.log(`[generate] Running: node ${args.join(" ")}`);

    const child = spawn("node", args, {
      cwd: __dirname,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", d => { stdout += d; process.stdout.write(d); });
    child.stderr.on("data", d => { stderr += d; process.stderr.write(d); });

    child.on("close", (code) => {
      if (code === 0) {
        // Regenerate static HTML
        exec("node generate-blog.js", { cwd: __dirname }, (err) => {
          if (err) console.error("[regenerate]", err.message);
        });
        json(res, 200, { ok: true, message: "Post generated and saved as draft." });
      } else {
        json(res, 500, { ok: false, message: stderr || "Generation failed." });
      }
    });
    return;
  }

  // POST /api/publish  { slug }
  if (req.method === "POST" && url.pathname === "/api/publish") {
    const { slug } = await readBody(req);
    if (!slug) return json(res, 400, { ok: false, message: "slug required" });

    const files = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith(".json"));
    let found = false;
    for (const f of files) {
      const fp = path.join(POSTS_DIR, f);
      try {
        const post = JSON.parse(fs.readFileSync(fp, "utf-8"));
        if (post.slug === slug) {
          post.status = "published";
          fs.writeFileSync(fp, JSON.stringify(post, null, 2));
          found = true;
          break;
        }
      } catch {}
    }
    if (!found) return json(res, 404, { ok: false, message: "Post not found" });

    exec("node generate-blog.js", { cwd: __dirname }, (err) => {
      if (err) console.error("[regenerate]", err.message);
    });
    return json(res, 200, { ok: true, message: "Post published and blog regenerated." });
  }

  // POST /api/regenerate
  if (req.method === "POST" && url.pathname === "/api/regenerate") {
    exec("node generate-blog.js", { cwd: __dirname }, (err, stdout) => {
      if (err) return json(res, 500, { ok: false, message: err.message });
      json(res, 200, { ok: true, message: "Blog regenerated successfully." });
    });
    return;
  }

  // GET /api/portfolio
  if (req.method === "GET" && url.pathname === "/api/portfolio") {
    try {
      const content = JSON.parse(fs.readFileSync(PORTFOLIO_CONTENT_FILE, "utf-8"));
      return json(res, 200, content);
    } catch {
      return json(res, 404, { error: "portfolio-content.json not found" });
    }
  }

  // POST /api/portfolio
  if (req.method === "POST" && url.pathname === "/api/portfolio") {
    const body = await readBody(req);
    try {
      fs.writeFileSync(PORTFOLIO_CONTENT_FILE, JSON.stringify(body, null, 2));
      return json(res, 200, { ok: true });
    } catch (e) {
      return json(res, 500, { ok: false, error: e.message });
    }
  }

  // Static file serving
  let filePath = path.join(__dirname, url.pathname === "/" ? "index.html" : url.pathname);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    setCORS(res);
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  setCORS(res);
  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`\n✅ Blog server running at http://localhost:${PORT}`);
  console.log(`   Generate posts, publish drafts, and rebuild static files.`);
  console.log(`   Open file:///Users/satya/Desktop/Projects/Portfolio/dashboard.html\n`);
});
