#!/usr/bin/env node
/**
 * generate-post.js
 * Generates a weekly "AI for Product Managers" blog post using Claude.
 *
 * Usage:
 *   node scripts/generate-post.js                               # auto-picks type, saves as draft
 *   node scripts/generate-post.js --publish                     # auto-picks type, publishes
 *   node scripts/generate-post.js --type=trends                 # AI trends roundup
 *   node scripts/generate-post.js --type=tool-guide             # auto-picks a tool
 *   node scripts/generate-post.js --type=tool-guide --tool="Claude Code"
 */

import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env from project root if ANTHROPIC_API_KEY not already set
if (!process.env.ANTHROPIC_API_KEY) {
  const envFile = path.join(__dirname, "..", ".env");
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, "utf-8").split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim();
    }
  }
}
const ROOT_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, "..");
const POSTS_DIR = path.join(ROOT_DIR, "posts");
const LOGS_DIR = path.join(ROOT_DIR, "logs");

// ─── CLI flags ────────────────────────────────────────────────────────────────
const isPublish = process.argv.includes("--publish");
const status = isPublish ? "published" : "draft";

const typeArg  = process.argv.find((a) => a.startsWith("--type="));
const toolArg  = process.argv.find((a) => a.startsWith("--tool="));
const topicArg = process.argv.find((a) => a.startsWith("--topic="));
const topicOverride = topicArg ? topicArg.split("=").slice(1).join("=").trim() : "";

// ─── Tools rotation list ──────────────────────────────────────────────────────
// When no --tool is specified, pick the next one not recently used.
const TOOLS_LIST = [
  "Claude Code",
  "Cursor",
  "ChatGPT",
  "Perplexity",
  "Notion AI",
  "Linear",
  "GitHub Copilot",
  "v0 by Vercel",
  "Lovable",
  "Bolt",
  "Gemini",
  "Replit Agent",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

function getDateString() {
  const now = new Date();
  const date = now.toISOString().split("T")[0];
  const time = now.toTimeString().slice(0, 8).replace(/:/g, "");
  return `${date}-${time}`;
}

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    fs.appendFileSync(path.join(LOGS_DIR, "generation.log"), line + "\n");
  } catch {
    // non-fatal
  }
}

/** Pick a tool that hasn't appeared in recent posts. */
function pickTool() {
  let recentTools = [];
  try {
    const files = fs
      .readdirSync(POSTS_DIR)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .reverse()
      .slice(0, 6);
    recentTools = files.flatMap((f) => {
      try {
        const p = JSON.parse(fs.readFileSync(path.join(POSTS_DIR, f), "utf-8"));
        return p.tool ? [p.tool] : [];
      } catch {
        return [];
      }
    });
  } catch {
    // posts dir might not exist yet
  }
  const available = TOOLS_LIST.filter((t) => !recentTools.includes(t));
  const pool = available.length > 0 ? available : TOOLS_LIST;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Decide post type: every 3rd post (by count) is a tool guide. */
function pickPostType() {
  let count = 0;
  try {
    count = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith(".json")).length;
  } catch {
    // fine
  }
  // posts 0,1 = trends; post 2 = tool-guide; posts 3,4 = trends; post 5 = tool-guide ...
  return count % 3 === 2 ? "tool-guide" : "trends";
}

// ─── System prompt (cached across runs) ──────────────────────────────────────
const SYSTEM_PROMPT = `You are a senior product manager and AI enthusiast writing a weekly newsletter called "AI for Product Managers."

Your audience: product managers at tech companies ranging from early-stage startups to large enterprises. They are smart, busy, and want practical insights they can apply immediately.

Your writing style:
- Write like a human, not a language model. Avoid AI-sounding filler phrases.
- No em dashes. Use commas, periods, or short sentences instead.
- No words like "delve", "landscape", "game-changer", "revolutionary", "transformative", "unlock", "leverage", "harness", "it's worth noting", "in conclusion", or "in summary".
- No hedging phrases like "it's important to note" or "this is a complex topic".
- Short sentences. Active voice. Say what you mean.
- Opinionated and direct. Share a point of view, not a balanced overview.
- Practical first. Every insight must connect to something a PM can actually do.
- Use relevant emoji section headers to aid scannability.

CRITICAL: You MUST respond with ONLY valid JSON — no markdown fences, no preamble, no commentary outside the JSON object.`;

// ─── Prompt builders ──────────────────────────────────────────────────────────
function buildTrendsPrompt(today, topic) {
  const topicLine = topic
    ? `Topic focus: "${topic}" — angle the trends section through this lens.`
    : `Topic: "Latest trends in AI that help or impact Product Management"`;
  return `Generate a blog post for the week of ${today.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.

${topicLine}

Cover 3-5 of the most impactful AI trends for PMs right now. Think about recent model releases, new capabilities, new tools, and shifts in how product teams work.

Return a JSON object with EXACTLY this structure:
{
  "title": "string — specific, interesting headline. Not generic.",
  "tldr": ["string", "string", "string"],
  "intro": "string — 2-3 short paragraphs setting the scene",
  "sections": [
    {
      "trend": "string — emoji + trend name (e.g. '🤖 Agentic Workflows')",
      "what": "string — 2 paragraphs explaining the trend clearly",
      "pmImpact": "string — 2 paragraphs on how this affects PM work specifically",
      "example": "string — a specific, named company or product example",
      "action": "string — one concrete thing a PM can do this week. Verb-first."
    }
  ],
  "closing": "string — 1-2 paragraphs. Forward-looking.",
  "takeaway": "string — one memorable sentence"
}

Rules:
- TL;DR: exactly 3 strings, each under 20 words
- 3-5 sections
- No em dashes anywhere. Use commas or short sentences.
- Write like a person, not a press release.
- No "in conclusion" or "in summary".`;
}

function buildToolGuidePrompt(today, tool, topic) {
  const topicLine = topic
    ? `Topic focus: "How Product Managers can use ${tool}" — specifically from the angle of: ${topic}`
    : `Topic: "How Product Managers can use ${tool}"`;
  return `Generate a blog post for the week of ${today.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.

${topicLine}

Write a practical guide for PMs on getting real value from ${tool}. Not a feature tour. Focus on specific PM workflows where this tool saves time or produces better output than the old way.

Return a JSON object with EXACTLY this structure:
{
  "title": "string — specific headline, e.g. 'How PMs Can Use ${tool} to Ship Faster'",
  "tldr": ["string", "string", "string"],
  "intro": "string — 2-3 short paragraphs. What is ${tool}, why should a PM care, what's the honest take on it.",
  "sections": [
    {
      "trend": "string — emoji + use case name (e.g. '🗂 Writing PRDs in Half the Time')",
      "what": "string — 2 paragraphs describing this specific use case and how ${tool} handles it",
      "pmImpact": "string — 2 paragraphs on the concrete time/quality gain for PMs. Be specific.",
      "example": "string — a real workflow example with actual prompts or steps a PM would follow",
      "action": "string — the exact first thing to try. Specific enough to do in 10 minutes."
    }
  ],
  "closing": "string — honest 1-2 paragraph take: where ${tool} is worth it and where it falls short",
  "takeaway": "string — one memorable sentence about ${tool} for PMs"
}

Rules:
- TL;DR: exactly 3 strings, each under 20 words
- 4-6 sections covering distinct PM use cases
- Each example should include a real prompt, workflow, or output that a PM would actually use
- Be honest about limitations. Don't oversell the tool.
- No em dashes. Use commas or short sentences.
- Write like a person, not a press release.`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function generatePost() {
  const client = new Anthropic();

  // Resolve post type and tool
  let postType = typeArg ? typeArg.replace("--type=", "") : pickPostType();
  let tool = null;

  if (postType === "tool-guide") {
    tool = toolArg ? toolArg.replace("--tool=", "") : pickTool();
  }

  log(`Starting post generation (type: ${postType}${tool ? `, tool: ${tool}` : ""}, status: ${status})...`);

  const today = new Date();
  const dateStr = getDateString();

  const userPrompt =
    postType === "tool-guide"
      ? buildToolGuidePrompt(today, tool, topicOverride)
      : buildTrendsPrompt(today, topicOverride);

  let fullText = "";

  try {
    log("Calling Claude API (streaming)...");

    const stream = client.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userPrompt }],
    });

    process.stdout.write("Generating");
    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        fullText += event.delta.text;
        process.stdout.write(".");
      }
    }
    process.stdout.write("\n");

    const finalMessage = await stream.finalMessage();
    log(
      `Done. Input: ${finalMessage.usage.input_tokens}, Output: ${finalMessage.usage.output_tokens}, Cache read: ${finalMessage.usage.cache_read_input_tokens ?? 0}`
    );
  } catch (err) {
    log(`ERROR calling Claude API: ${err.message}`);
    process.exit(1);
  }

  // ─── Parse JSON ───────────────────────────────────────────────────────────
  let postData;
  try {
    const cleaned = fullText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    postData = JSON.parse(cleaned);
  } catch (err) {
    log(`ERROR: Failed to parse JSON — ${err.message}`);
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    fs.writeFileSync(path.join(LOGS_DIR, "last-raw-response.txt"), fullText);
    log("Raw response saved to logs/last-raw-response.txt");
    process.exit(1);
  }

  // ─── Enrich with metadata ─────────────────────────────────────────────────
  const wordCount = Object.values(postData)
    .flat()
    .filter((v) => typeof v === "string")
    .join(" ")
    .split(/\s+/).length;

  const post = {
    ...postData,
    postType,
    ...(tool ? { tool } : {}),
    slug: slugify(postData.title),
    generatedAt: new Date().toISOString(),
    status,
    wordCount,
  };

  // ─── Save ─────────────────────────────────────────────────────────────────
  fs.mkdirSync(POSTS_DIR, { recursive: true });
  const filename = `${dateStr}.json`;
  const filepath = path.join(POSTS_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(post, null, 2));

  log(`✓ Saved: posts/${filename} (${wordCount} words, ${postType}, status: ${status})`);
  log(`  Title: "${post.title}"`);
  log(`  Slug:  ${post.slug}`);

  return post;
}

generatePost().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
