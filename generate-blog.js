#!/usr/bin/env node
/**
 * Generates static blog HTML files from posts JSON.
 * Run from Portfolio/ directory: node generate-blog.js
 *
 * Outputs:
 *   blog.html             — post listing page
 *   blog-posts/[slug].html — individual post pages
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POSTS_DIR = path.join(__dirname, "posts");
const OUT_DIR = path.join(__dirname);
const POSTS_OUT_DIR = path.join(__dirname, "blog-posts");

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "long", day: "numeric", year: "numeric",
    });
  } catch { return iso; }
}

function formatLongDate(iso) {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
    });
  } catch { return iso; }
}

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function loadAllPosts() {
  if (!fs.existsSync(POSTS_DIR)) return [];
  return fs.readdirSync(POSTS_DIR)
    .filter(f => f.endsWith(".json"))
    .sort().reverse()
    .map(f => {
      try {
        const post = JSON.parse(fs.readFileSync(path.join(POSTS_DIR, f), "utf-8"));
        if (!post.postType) post.postType = "trends";
        post._filename = f;
        return post;
      } catch { return null; }
    })
    .filter(Boolean);
}

function loadPosts() {
  return loadAllPosts().filter(p => p.status === "published");
}

// ── Shared CSS (portfolio-matching) ────────────────────────────────────────────

const SHARED_CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { scroll-behavior: smooth; }
  body {
    font-family: arial, sans-serif;
    background: #fff;
    color: #202124;
    font-size: 14px;
  }
  a { text-decoration: none; }

  /* ── TOP NAV ── */
  .g-topnav {
    display: flex; justify-content: flex-end; align-items: center;
    padding: 8px 20px; gap: 16px;
    border-bottom: 1px solid #ebebeb; font-size: 13px;
  }
  .g-topnav a { color: #5f6368; font-size: 13px; }
  .g-topnav a:hover { text-decoration: underline; color: #202124; }
  .g-topnav-left { display: flex; gap: 20px; margin-right: auto; }
  .g-signin {
    background: #1a73e8; color: #fff !important;
    padding: 8px 18px; border-radius: 4px;
    font-size: 13px; font-weight: 500;
  }
  .g-signin:hover { background: #1557b0; text-decoration: none !important; }

  /* ── SEARCH HEADER ── */
  .g-header {
    padding: 16px 20px 0;
    display: flex; align-items: center; gap: 24px;
  }
  .g-logo { flex-shrink: 0; display: flex; align-items: center; }
  .g-logo img { height: 54px; width: auto; }
  .g-searchbar-wrap { display: flex; align-items: center; gap: 12px; flex: 1; max-width: 580px; }
  .g-searchbar {
    display: flex; align-items: center;
    border: 1px solid #dfe1e5; border-radius: 24px;
    padding: 8px 16px; gap: 10px; flex: 1;
    box-shadow: 0 1px 6px rgba(32,33,36,.1);
  }
  .g-searchbar:hover { box-shadow: 0 1px 6px rgba(32,33,36,.2); }
  .g-searchbar input {
    border: none; outline: none;
    font-size: 16px; color: #202124;
    flex: 1; background: transparent;
    font-family: arial, sans-serif;
  }
  .g-searchbar svg { width: 18px; height: 18px; color: #70757a; flex-shrink: 0; }
  .g-searchbar .mic-icon { color: #4285F4; }
  .g-search-btn {
    background: #f8f9fa; border: 1px solid #f8f9fa;
    border-radius: 4px; padding: 8px 16px;
    font-size: 14px; color: #202124; cursor: pointer; white-space: nowrap;
  }
  .g-search-btn:hover { box-shadow: 0 1px 3px rgba(0,0,0,.2); border-color: #dadce0; }

  /* ── RESULT TABS ── */
  .g-tabs {
    display: flex; align-items: center;
    padding: 6px 20px 0 174px;
    border-bottom: 1px solid #ebebeb; margin-top: 10px;
  }
  .g-tab {
    padding: 10px 14px; font-size: 13px; color: #5f6368;
    cursor: pointer; border-bottom: 3px solid transparent;
    display: flex; align-items: center; gap: 5px; white-space: nowrap;
    text-decoration: none;
  }
  .g-tab.active { color: #1a73e8; border-bottom-color: #1a73e8; font-weight: 500; }
  .g-tab:hover:not(.active) { color: #202124; border-bottom-color: #ddd; }
  .g-tab svg { width: 14px; height: 14px; }
  .g-tab-sep { margin-left: auto; border-left: 1px solid #ebebeb; padding-left: 14px; }

  /* ── MAIN BODY ── */
  .g-body {
    display: flex; padding: 0 20px;
    max-width: 1200px; margin: 0 auto;
  }

  /* ── LEFT SIDEBAR (profile) ── */
  .g-sidebar {
    width: 154px; flex-shrink: 0;
    padding: 18px 30px 0 0;
  }
  .g-sidebar-name { font-size: 13px; font-weight: 700; color: #202124; margin-bottom: 2px; }
  .g-sidebar-title { font-size: 11px; color: #5f6368; margin-bottom: 14px; line-height: 1.4; }
  .g-sidebar-section {
    font-size: 11px; font-weight: 700; color: #70757a;
    text-transform: uppercase; letter-spacing: .5px;
    margin: 12px 0 6px; border-top: 1px solid #ebebeb; padding-top: 12px;
  }
  .g-sidebar-item { font-size: 12px; color: #4d5156; line-height: 1.8; }
  .g-sidebar-item strong { color: #202124; }

  /* ── RESULTS COLUMN ── */
  .g-results {
    flex: 1; min-width: 0;
    padding: 12px 0 40px 20px; max-width: 660px;
  }
  .g-result-count { font-size: 13px; color: #70757a; margin-bottom: 18px; }

  /* ── POST CARD (styled as search result) ── */
  .g-result { margin-bottom: 28px; }
  .g-result-url-row { display: flex; align-items: center; gap: 8px; margin-bottom: 2px; }
  .g-result-url { font-size: 12px; color: #202124; }
  .g-result-title {
    font-size: 20px; color: #1a0dab; font-weight: normal;
    line-height: 1.3; margin-bottom: 4px;
  }
  .g-result-title:hover { text-decoration: underline; }
  .g-result-snippet { font-size: 14px; color: #3c4043; line-height: 1.6; margin-bottom: 8px; }
  .g-result-date { color: #70757a; }
  .g-result-meta { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }
  .g-badge {
    display: inline-block; font-size: 11px; font-weight: 500;
    padding: 2px 8px; border-radius: 20px; border: 1px solid;
  }
  .g-badge-blue { color: #1a73e8; background: #e8f0fe; border-color: #c5d8fd; }
  .g-badge-green { color: #137333; background: #e6f4ea; border-color: #b7d9c4; }
  .g-tldr-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
  .g-tldr-chip {
    font-size: 11px; color: #1a73e8; background: #e8f0fe;
    border: 1px solid #c5d8fd; border-radius: 20px; padding: 2px 10px;
  }

  /* ── RIGHT SIDEBAR (blog) ── */
  .g-right-sidebar { width: 240px; flex-shrink: 0; padding: 12px 0 0 24px; }
  .g-widget {
    background: #fff; border: 1px solid #dadce0; border-radius: 8px;
    padding: 14px; margin-bottom: 14px; box-shadow: 0 1px 2px rgba(0,0,0,.06);
  }
  .g-widget-label {
    font-size: 11px; font-weight: 700; color: #70757a;
    text-transform: uppercase; letter-spacing: .05em; margin-bottom: 8px;
  }
  .g-widget p { font-size: 13px; color: #70757a; line-height: 1.6; }
  .g-widget-issue { margin-bottom: 10px; }
  .g-widget-issue-title { font-size: 13px; font-weight: 500; color: #1a0dab; line-height: 1.4; margin-bottom: 2px; }
  .g-widget-issue-title:hover { text-decoration: underline; }
  .g-widget-issue-date { font-size: 11px; color: #70757a; }
  .g-widget-takeaway { background: #fffbeb; border-color: #fde68a; }
  .g-widget-takeaway .g-widget-label { color: #92400e; }
  .g-widget-takeaway p { font-size: 13px; font-weight: 500; color: #78350f; font-style: italic; }

  /* ── ARTICLE PAGE ── */
  .b-article-header { margin-bottom: 24px; }
  .b-article h1 {
    font-size: 26px; font-weight: 700; color: #202124;
    line-height: 1.3; margin-top: 10px;
  }
  .b-tldr {
    background: #e8f0fe; border: 1px solid #c5d8fd;
    border-radius: 8px; padding: 18px; margin-bottom: 28px;
  }
  .b-tldr-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
  .b-tldr-head span { font-size: 12px; font-weight: 700; color: #1a73e8; text-transform: uppercase; letter-spacing: .05em; }
  .b-tldr ol { padding-left: 20px; }
  .b-tldr li { font-size: 14px; color: #202124; line-height: 1.6; margin-bottom: 5px; }
  .b-prose p { font-size: 15px; color: #3c4043; line-height: 1.7; margin-bottom: 14px; }
  .b-section { margin-bottom: 32px; }
  .b-section h2 { font-size: 18px; font-weight: 700; color: #202124; margin-bottom: 12px; }
  .b-section p { font-size: 14px; color: #3c4043; line-height: 1.7; margin-bottom: 10px; }
  .b-pm-impact { border-left: 4px solid #1a73e8; padding-left: 14px; margin-bottom: 12px; }
  .b-pm-impact-label { font-size: 11px; font-weight: 700; color: #1a73e8; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 5px; }
  .b-example { background: #f8f9fa; border: 1px solid #dadce0; border-radius: 6px; padding: 10px 14px; margin-bottom: 8px; }
  .b-example-label { font-size: 11px; font-weight: 700; color: #70757a; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 3px; }
  .b-example p { font-size: 13px; color: #5f6368; margin: 0; }
  .b-action { background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 10px 14px; }
  .b-action-label { font-size: 11px; font-weight: 700; color: #92400e; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 3px; }
  .b-action p { font-size: 13px; font-weight: 500; color: #78350f; margin: 0; }
  hr.b-divider { border: none; border-top: 1px solid #ebebeb; margin: 28px 0; }
  .b-takeaway {
    background: #fffbeb; border: 2px solid #fde68a;
    border-radius: 8px; padding: 24px; text-align: center; margin: 28px 0;
  }
  .b-takeaway-label { font-size: 11px; font-weight: 700; color: #92400e; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 8px; }
  .b-takeaway blockquote { font-size: 16px; font-weight: 600; color: #78350f; line-height: 1.4; max-width: 520px; margin: 0 auto; }
  .b-back-link { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: #70757a; margin-top: 28px; }
  .b-back-link:hover { color: #1a73e8; text-decoration: underline; }

  /* ── FOOTER ── */
  .g-footer {
    background: #f2f2f2; border-top: 1px solid #e0e0e0;
    padding: 14px 20px; font-size: 13px; color: #70757a; text-align: center;
  }
  .g-footer a { color: #70757a; margin: 0 10px; }
  .g-footer a:hover { text-decoration: underline; }

  @media (max-width: 760px) {
    .g-sidebar, .g-right-sidebar { display: none; }
    .g-results { padding-left: 0; max-width: 100%; }
    .g-tabs { padding-left: 10px; overflow-x: auto; }
    .g-header { gap: 10px; padding: 10px 12px 0; flex-wrap: wrap; }
    .g-logo img { height: 36px; }
    .g-search-btn { display: none; }
    .g-body { padding: 0 12px; }
    .g-topnav { padding: 6px 12px; }
    .g-topnav-left { display: none; }
    .g-topnav a:not(.g-signin) { display: none; }
  }
`;

const FONT_LINK = `<link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap" rel="stylesheet">`;

// ── Shared portfolio header HTML ───────────────────────────────────────────────

function portfolioHeader(searchQuery, activeTab, backPrefix) {
  return `
<!-- TOP NAV -->
<div class="g-topnav">
  <div class="g-topnav-left">
    <a href="${backPrefix}index.html">Resume</a>
    <a href="${backPrefix}index.html">Portfolio</a>
    <a href="${backPrefix}blog.html" style="color:#1a73e8;font-weight:500">Blog</a>
  </div>
  <a href="mailto:satyanarayan.s@gmail.com">satyanarayan.s@gmail.com</a>
  <a href="https://www.linkedin.com/in/satya-sundararaman" target="_blank" style="display:inline-flex;align-items:center;gap:4px;color:#0077b5;font-weight:500">
    <img src="https://www.google.com/s2/favicons?domain=linkedin.com&sz=16" style="width:14px;height:14px;border-radius:2px" alt=""/> LinkedIn
  </a>
  <a class="g-signin" href="tel:6789869290">678-986-9290</a>
</div>

<!-- SEARCH HEADER -->
<header class="g-header">
  <div class="g-logo">
    <a href="${backPrefix}index.html">
      <img src="https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png" alt="Google" />
    </a>
  </div>
  <div class="g-searchbar-wrap">
    <div class="g-searchbar">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
      <input type="text" value="${esc(searchQuery)}" readonly />
      <svg class="mic-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.49 6-3.31 6-6.72h-1.7z"/></svg>
    </div>
    <button class="g-search-btn">Google Search</button>
    <button class="g-search-btn">I'm Feeling Lucky</button>
  </div>
</header>

<!-- TABS -->
<nav class="g-tabs">
  <a href="${backPrefix}index.html" class="g-tab${activeTab === "portfolio" ? " active" : ""}">
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>Portfolio
  </a>
  <a href="${backPrefix}index.html#resume" class="g-tab${activeTab === "resume" ? " active" : ""}">
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>Resume
  </a>
  <a href="${backPrefix}blog.html" class="g-tab${activeTab === "blog" ? " active" : ""}">
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>Blog
  </a>
  <a href="https://www.linkedin.com/in/satya-sundararaman" target="_blank" class="g-tab">
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>LinkedIn
  </a>
  <a href="${backPrefix}dashboard.html" class="g-tab g-tab-sep${activeTab === "manage" ? " active" : ""}">
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>Manage
  </a>
</nav>`;
}

// ── Generate listing page ──────────────────────────────────────────────────────

function generateListing(posts) {
  const latest = posts[0];
  const older = posts.slice(1);

  const postCards = posts.map((post, i) => {
    const typeBadge = post.postType === "tool-guide"
      ? `<span class="g-badge g-badge-green">🔧 Tool Guide${post.tool ? `: ${esc(post.tool)}` : ""}</span>`
      : `<span class="g-badge g-badge-blue">📈 Trends</span>`;
    const latestBadge = i === 0
      ? `<span class="g-badge g-badge-blue">Latest</span>` : "";
    const tldrChips = (post.tldr || []).slice(0, 2).map(t =>
      `<span class="g-tldr-chip">${esc(t.length > 60 ? t.slice(0, 57) + "…" : t)}</span>`
    ).join("");
    const snippet = esc((post.intro || "").split("\n")[0]);

    return `
      <div class="g-result">
        <div class="g-result-url-row">
          <span class="g-result-url">satya-sundararaman.com › blog › ${esc(post.slug)}</span>
        </div>
        <a href="blog-posts/${esc(post.slug)}.html">
          <div class="g-result-title">${esc(post.title)}</div>
        </a>
        <div class="g-result-meta">
          ${latestBadge} ${typeBadge}
          <span style="font-size:13px;color:#70757a">${formatDate(post.generatedAt)}</span>
          <span style="color:#dadce0">·</span>
          <span style="font-size:13px;color:#70757a">${(post.wordCount || 0).toLocaleString()} words</span>
        </div>
        <div class="g-result-snippet">${snippet}</div>
        <div class="g-tldr-chips">${tldrChips}</div>
      </div>`;
  }).join("");

  const prevIssues = older.map(post => `
    <div class="g-widget-issue">
      <a href="blog-posts/${esc(post.slug)}.html">
        <div class="g-widget-issue-title">${esc(post.title)}</div>
      </a>
      <div class="g-widget-issue-date">${formatDate(post.generatedAt)}</div>
    </div>`).join("");

  const takeawayWidget = latest ? `
    <div class="g-widget g-widget-takeaway">
      <div class="g-widget-label">💡 Latest Takeaway</div>
      <p>"${esc(latest.takeaway)}"</p>
    </div>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AI for Product Managers Blog — Satya Sundararaman</title>
  ${FONT_LINK}
  <style>${SHARED_CSS}</style>
</head>
<body>

  ${portfolioHeader("AI for Product Managers Blog", "blog", "")}

  <div class="g-body">
    <!-- Left sidebar (compact) -->
    <aside class="g-sidebar">
      <div class="g-sidebar-name">Satya Sundararaman</div>
      <div class="g-sidebar-title">Director of Product</div>
      <div class="g-sidebar-section">Blog</div>
      <div class="g-sidebar-item"><strong>${posts.length}</strong> Published Issues</div>
      <div class="g-sidebar-section">Topics</div>
      <div class="g-sidebar-item">AI / ML for PMs</div>
      <div class="g-sidebar-item">Product Strategy</div>
      <div class="g-sidebar-item">Tool Guides</div>
    </aside>

    <!-- Main results -->
    <main class="g-results">
      <p class="g-result-count">About <strong>${posts.length}</strong> result${posts.length !== 1 ? "s" : ""} for <em>AI for Product Managers</em></p>
      ${posts.length === 0
        ? `<p style="color:#70757a;padding:32px 0">No posts published yet — check back soon.</p>`
        : postCards}
    </main>

    <!-- Right sidebar -->
    <aside class="g-right-sidebar">
      <div class="g-widget">
        <div class="g-widget-label">About This Blog</div>
        <p>Weekly AI trends curated for product managers — written by AI, reviewed for relevance.</p>
      </div>
      ${older.length > 0 ? `
      <div class="g-widget">
        <div class="g-widget-label">Previous Issues</div>
        ${prevIssues}
      </div>` : ""}
      ${takeawayWidget}
    </aside>
  </div>

  <footer class="g-footer">
    <a href="index.html">← Portfolio</a>
    <span>·</span>
    <a href="mailto:satyanarayan.s@gmail.com">satyanarayan.s@gmail.com</a>
    <span>·</span>
    <a href="https://www.linkedin.com/in/satya-sundararaman" target="_blank">LinkedIn</a>
  </footer>

</body>
</html>`;
}

// ── Generate individual post page ─────────────────────────────────────────────

function generatePost(post, allPosts) {
  const others = allPosts.filter(p => p.slug !== post.slug);

  const tldrItems = (post.tldr || []).map((item, i) =>
    `<li><strong style="color:#1a73e8">${i + 1}.</strong> ${esc(item)}</li>`
  ).join("");

  const sections = (post.sections || []).map(s => `
    <div class="b-section">
      <h2>${esc(s.trend)}</h2>
      ${(s.what || "").split("\n").filter(Boolean).map(p => `<p>${esc(p)}</p>`).join("")}
      <div class="b-pm-impact">
        <div class="b-pm-impact-label">📌 PM Impact</div>
        ${(s.pmImpact || "").split("\n").filter(Boolean).map(p => `<p>${esc(p)}</p>`).join("")}
      </div>
      <div class="b-example">
        <div class="b-example-label">🏢 Real-World Example</div>
        <p>${esc(s.example)}</p>
      </div>
      <div class="b-action">
        <div class="b-action-label">✅ Action Item</div>
        <p>${esc(s.action)}</p>
      </div>
    </div>`
  ).join("");

  const introParagraphs = (post.intro || "").split("\n").filter(Boolean)
    .map(p => `<p>${esc(p)}</p>`).join("");
  const closingParagraphs = (post.closing || "").split("\n").filter(Boolean)
    .map(p => `<p>${esc(p)}</p>`).join("");

  const typeBadge = post.postType === "tool-guide"
    ? `<span class="g-badge g-badge-green">🔧 Tool Guide${post.tool ? `: ${esc(post.tool)}` : ""}</span>`
    : `<span class="g-badge g-badge-blue">📈 Trends</span>`;

  const sidebarOthers = others.map(p => `
    <div class="g-widget-issue">
      <a href="${esc(p.slug)}.html">
        <div class="g-widget-issue-title">${esc(p.title)}</div>
      </a>
      <div class="g-widget-issue-date">${formatDate(p.generatedAt)}</div>
    </div>`).join("");

  const sectionTags = (post.sections || []).map(s =>
    `<span class="g-badge g-badge-blue" style="font-size:11px">${esc(s.trend.split(" ").slice(0, 3).join(" "))}</span>`
  ).join(" ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(post.title)} — AI for Product Managers</title>
  ${FONT_LINK}
  <style>${SHARED_CSS}</style>
</head>
<body>

  ${portfolioHeader(post.title, "blog", "../")}

  <div class="g-body">
    <!-- Left sidebar -->
    <aside class="g-sidebar">
      <div class="g-sidebar-name">Satya Sundararaman</div>
      <div class="g-sidebar-title">Director of Product</div>
      <div class="g-sidebar-section">This Post</div>
      <div class="g-sidebar-item"><strong>${formatDate(post.generatedAt)}</strong></div>
      <div class="g-sidebar-item">${(post.wordCount || 0).toLocaleString()} words</div>
      <div class="g-sidebar-section">Topics</div>
      <div class="g-sidebar-item">${typeBadge.replace(/<[^>]+>/g, "")}</div>
    </aside>

    <!-- Article -->
    <main class="g-results">
      <!-- Breadcrumb -->
      <div style="font-size:13px;color:#70757a;margin-bottom:14px">
        <a href="../blog.html" style="color:#1a73e8">← All Issues</a>
        <span style="margin:0 6px">·</span>
        <span>${formatLongDate(post.generatedAt)}</span>
      </div>

      <article class="b-article">
        <header class="b-article-header">
          <div class="g-result-meta" style="margin-bottom:8px">
            ${typeBadge}
            <span style="font-size:12px;color:#70757a">${formatLongDate(post.generatedAt)}</span>
            <span style="color:#dadce0">·</span>
            <span style="font-size:12px;color:#70757a">${(post.wordCount || 0).toLocaleString()} words</span>
          </div>
          <h1>${esc(post.title)}</h1>
        </header>

        <div class="b-tldr">
          <div class="b-tldr-head">
            <span>⚡</span>
            <span>TL;DR</span>
          </div>
          <ol>${tldrItems}</ol>
        </div>

        <div class="b-prose">${introParagraphs}</div>
        <hr class="b-divider" />
        ${sections}
        <hr class="b-divider" />
        <div class="b-prose">${closingParagraphs}</div>

        <div class="b-takeaway">
          <div style="font-size:22px;margin-bottom:6px">💡</div>
          <div class="b-takeaway-label">PM Takeaway of the Week</div>
          <blockquote>"${esc(post.takeaway)}"</blockquote>
        </div>

        <a href="../blog.html" class="b-back-link">← Back to all issues</a>
      </article>
    </main>

    <!-- Right sidebar -->
    <aside class="g-right-sidebar">
      <div class="g-widget">
        <div class="g-widget-label">This Issue</div>
        <p style="font-weight:500;color:#202124;font-size:13px;margin-bottom:8px">${esc(post.title)}</p>
        <div style="display:flex;flex-wrap:wrap;gap:4px">${sectionTags}</div>
      </div>
      <div class="g-widget g-widget-takeaway">
        <div class="g-widget-label">💡 Takeaway</div>
        <p>"${esc(post.takeaway)}"</p>
      </div>
      ${others.length > 0 ? `
      <div class="g-widget">
        <div class="g-widget-label">Other Issues</div>
        ${sidebarOthers}
      </div>` : ""}
      <div style="margin-top:8px">
        <a href="../blog.html" style="font-size:13px;color:#1a73e8">← All issues</a>
      </div>
    </aside>
  </div>

  <footer class="g-footer">
    <a href="../index.html">← Portfolio</a>
    <span>·</span>
    <a href="../blog.html">Blog</a>
    <span>·</span>
    <a href="mailto:satyanarayan.s@gmail.com">satyanarayan.s@gmail.com</a>
  </footer>

</body>
</html>`;
}

// ── Generate dashboard page ───────────────────────────────────────────────────

function generateDashboard(allPosts) {
  const published  = allPosts.filter(p => p.status === "published");
  const drafts     = allPosts.filter(p => p.status !== "published");
  const trends     = allPosts.filter(p => p.postType === "trends");
  const toolGuides = allPosts.filter(p => p.postType === "tool-guide");

  const statsBar = [
    ["Total Posts",  allPosts.length,   "#1a73e8", "#e8f0fe", "#c5d8fd"],
    ["Published",    published.length,  "#137333", "#e6f4ea", "#b7d9c4"],
    ["Drafts",       drafts.length,     "#b06000", "#fef9c3", "#fde68a"],
    ["Trend Issues", trends.length,     "#1a73e8", "#e8f0fe", "#c5d8fd"],
    ["Tool Guides",  toolGuides.length, "#137333", "#e6f4ea", "#b7d9c4"],
  ].map(([label, val, color, bg, border]) => `
    <div style="background:${bg};border:1px solid ${border};border-radius:8px;padding:12px 18px;min-width:110px">
      <div style="font-size:22px;font-weight:700;color:${color}">${val}</div>
      <div style="font-size:11px;color:#5f6368;margin-top:2px">${label}</div>
    </div>`).join("");

  const rows = allPosts.map(post => {
    const isPublished = post.status === "published";
    const statusBadge = isPublished
      ? `<span style="background:#e6f4ea;color:#137333;border:1px solid #b7d9c4;border-radius:20px;font-size:11px;padding:2px 8px;font-weight:500">Published</span>`
      : `<span style="background:#fef9c3;color:#b06000;border:1px solid #fde68a;border-radius:20px;font-size:11px;padding:2px 8px;font-weight:500">Draft</span>`;
    const typeBadge = post.postType === "tool-guide"
      ? `<span style="background:#e6f4ea;color:#137333;border:1px solid #b7d9c4;border-radius:20px;font-size:11px;padding:2px 8px">🔧 Tool</span>`
      : `<span style="background:#e8f0fe;color:#1a73e8;border:1px solid #c5d8fd;border-radius:20px;font-size:11px;padding:2px 8px">📈 Trends</span>`;
    const actions = isPublished
      ? `<a href="blog-posts/${esc(post.slug)}.html" style="color:#1a73e8;font-size:12px">View ↗</a>`
      : `<button onclick="publishPost('${esc(post.slug)}')" style="font-size:11px;font-weight:500;color:#137333;background:#e6f4ea;border:1px solid #b7d9c4;border-radius:4px;padding:3px 10px;cursor:pointer">Publish</button>`;

    return `
      <tr style="border-bottom:1px solid #ebebeb">
        <td style="padding:12px 14px;max-width:300px">
          <div style="font-size:13px;font-weight:500;color:#202124;line-height:1.4;margin-bottom:3px">${esc(post.title)}</div>
          <div style="font-size:11px;color:#70757a;font-family:monospace">${esc(post.slug)}</div>
        </td>
        <td style="padding:12px 14px;white-space:nowrap">${typeBadge}</td>
        <td style="padding:12px 14px;white-space:nowrap;font-size:12px;color:#5f6368">${formatDate(post.generatedAt)}</td>
        <td style="padding:12px 14px">${statusBadge}</td>
        <td style="padding:12px 14px;font-size:12px;color:#5f6368;white-space:nowrap">${(post.wordCount || 0).toLocaleString()} words</td>
        <td style="padding:12px 14px">${actions}</td>
      </tr>`;
  }).join("");

  const TOOLS_LIST = ["Claude Code","Cursor","ChatGPT","Perplexity","Notion AI","Linear","GitHub Copilot","v0 by Vercel","Lovable","Bolt","Gemini","Replit Agent"];
  const toolOptions = TOOLS_LIST.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Manage Blog — Satya Sundararaman</title>
  ${FONT_LINK}
  <style>
    ${SHARED_CSS}
    table { width: 100%; border-collapse: collapse; }
    th { text-align:left; font-size:11px; font-weight:700; color:#70757a; text-transform:uppercase; letter-spacing:.05em; padding:8px 14px; border-bottom:2px solid #dadce0; }
    .dash-btn { display:inline-flex; align-items:center; gap:6px; padding:8px 16px; border-radius:4px; font-size:13px; font-weight:500; cursor:pointer; border:none; transition:background .15s; }
    .dash-btn-primary { background:#1a73e8; color:#fff; }
    .dash-btn-primary:hover { background:#1557b0; }
    .dash-btn-primary:disabled { background:#8ab4f8; cursor:not-allowed; }
    select, .dash-select { font-size:13px; color:#202124; border:1px solid #dadce0; border-radius:4px; padding:7px 10px; background:#fff; cursor:pointer; }
    .toast { position:fixed; bottom:24px; right:24px; padding:12px 20px; border-radius:8px; font-size:13px; font-weight:500; box-shadow:0 4px 12px rgba(0,0,0,.15); z-index:999; display:none; }
    .toast.success { background:#e6f4ea; color:#137333; border:1px solid #b7d9c4; }
    .toast.error   { background:#fce8e6; color:#c5221f; border:1px solid #f5c6c4; }
    .toast.loading { background:#e8f0fe; color:#1a73e8; border:1px solid #c5d8fd; }
    #serverStatus { font-size:11px; font-weight:500; padding:2px 8px; border-radius:20px; display:inline-block; }
    #serverStatus.online  { background:#e6f4ea; color:#137333; border:1px solid #b7d9c4; }
    #serverStatus.offline { background:#fce8e6; color:#c5221f; border:1px solid #f5c6c4; }
  </style>
</head>
<body>

  ${portfolioHeader("Blog Dashboard — Manage Posts", "manage", "")}

  <div class="g-body">
    <aside class="g-sidebar">
      <div class="g-sidebar-name">Satya Sundararaman</div>
      <div class="g-sidebar-title">Director of Product</div>
      <div class="g-sidebar-section">Stats</div>
      <div class="g-sidebar-item"><strong>${published.length}</strong> Published</div>
      <div class="g-sidebar-item"><strong>${drafts.length}</strong> Drafts</div>
      <div class="g-sidebar-item"><strong>${allPosts.length}</strong> Total</div>
      <div class="g-sidebar-section">Actions</div>
      <div class="g-sidebar-item"><a href="blog.html" style="color:#1a73e8">View Blog ↗</a></div>
    </aside>

    <main class="g-results" style="max-width:820px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <p class="g-result-count" style="margin:0">Blog Dashboard · <strong>${allPosts.length}</strong> total post${allPosts.length !== 1 ? "s" : ""}</p>
        <span id="serverStatus" class="offline">● Server offline</span>
      </div>

      <!-- Stats -->
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px">${statsBar}</div>

      <!-- Generate Post -->
      <div style="background:#fff;border:1px solid #dadce0;border-radius:8px;padding:18px;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,.06)">
        <div style="font-size:13px;font-weight:700;color:#202124;margin-bottom:12px">✨ Generate New Post</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
          <select id="postType" class="dash-select">
            <option value="">Auto (pick type)</option>
            <option value="trends">📈 AI Trends</option>
            <option value="tool-guide">🔧 Tool Guide</option>
          </select>
          <select id="postTool" class="dash-select" style="display:none">
            <option value="">Auto (pick tool)</option>
            ${toolOptions}
          </select>
          <button id="generateBtn" class="dash-btn dash-btn-primary" onclick="generatePost()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            Generate Post
          </button>
          <span style="font-size:12px;color:#70757a">Saves as draft · requires <code style="background:#f8f9fa;padding:1px 4px;border-radius:3px">node server.js</code> running</span>
        </div>
      </div>

      <!-- Posts Table -->
      <div style="background:#fff;border:1px solid #dadce0;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06)">
        <table>
          <thead>
            <tr style="background:#f8f9fa">
              <th>Title</th><th>Type</th><th>Date</th><th>Status</th><th>Length</th><th>Actions</th>
            </tr>
          </thead>
          <tbody id="postsTable">
            ${allPosts.length === 0
              ? `<tr><td colspan="6" style="padding:32px;text-align:center;color:#70757a">No posts found.</td></tr>`
              : rows}
          </tbody>
        </table>
      </div>

      <div style="margin-top:14px;padding:12px 16px;background:#f8f9fa;border:1px solid #dadce0;border-radius:8px;font-size:12px;color:#5f6368">
        To start the server: open a terminal in <code style="background:#fff;padding:1px 5px;border-radius:3px;border:1px solid #dadce0">Portfolio/</code> and run <code style="background:#fff;padding:1px 5px;border-radius:3px;border:1px solid #dadce0">node server.js</code>. Static files update automatically after each action.
      </div>
    </main>
  </div>

  <footer class="g-footer">
    <a href="index.html">← Portfolio</a> · <a href="blog.html">Blog</a> · <a href="mailto:satyanarayan.s@gmail.com">satyanarayan.s@gmail.com</a>
  </footer>

  <div id="toast" class="toast"></div>

  <script>
    const API = 'http://localhost:3001';

    // ── Show/hide tool selector ──────────────────────────────────────────────
    document.getElementById('postType').addEventListener('change', function() {
      document.getElementById('postTool').style.display =
        this.value === 'tool-guide' ? 'inline-block' : 'none';
    });

    // ── Toast ────────────────────────────────────────────────────────────────
    function showToast(msg, type = 'success', duration = 4000) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.className = 'toast ' + type;
      t.style.display = 'block';
      if (duration) setTimeout(() => t.style.display = 'none', duration);
    }

    // ── Server status check ──────────────────────────────────────────────────
    async function checkServer() {
      const el = document.getElementById('serverStatus');
      try {
        const r = await fetch(API + '/api/posts', { signal: AbortSignal.timeout(2000) });
        if (r.ok) {
          el.textContent = '● Server online';
          el.className = 'online';
          document.getElementById('generateBtn').disabled = false;
          return true;
        }
      } catch {}
      el.textContent = '● Server offline';
      el.className = 'offline';
      document.getElementById('generateBtn').disabled = true;
      return false;
    }
    checkServer();
    setInterval(checkServer, 8000);

    // ── Generate ─────────────────────────────────────────────────────────────
    async function generatePost() {
      if (!(await checkServer())) {
        return showToast('Server is offline. Run: node server.js', 'error');
      }
      const type = document.getElementById('postType').value;
      const tool = document.getElementById('postTool').value;
      const btn  = document.getElementById('generateBtn');
      btn.disabled = true;
      btn.textContent = 'Generating…';
      showToast('Generating post with Claude… this takes ~30 seconds.', 'loading', 0);
      try {
        const res = await fetch(API + '/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, tool }),
        });
        const data = await res.json();
        if (data.ok) {
          showToast('✓ Post generated as draft. Refreshing…', 'success');
          setTimeout(() => location.reload(), 2000);
        } else {
          showToast('Error: ' + data.message, 'error');
        }
      } catch (e) {
        showToast('Request failed: ' + e.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Generate Post';
      }
    }

    // ── Publish ──────────────────────────────────────────────────────────────
    async function publishPost(slug) {
      if (!(await checkServer())) {
        return showToast('Server is offline. Run: node server.js', 'error');
      }
      showToast('Publishing…', 'loading', 0);
      try {
        const res = await fetch(API + '/api/publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug }),
        });
        const data = await res.json();
        if (data.ok) {
          showToast('✓ Published! Refreshing…', 'success');
          setTimeout(() => location.reload(), 1500);
        } else {
          showToast('Error: ' + data.message, 'error');
        }
      } catch (e) {
        showToast('Request failed: ' + e.message, 'error');
      }
    }
  </script>
</body>
</html>`;
}

// ── Main ───────────────────────────────────────────────────────────────────────

const allPosts = loadAllPosts();
const posts    = allPosts.filter(p => p.status === "published");
console.log(`Found ${allPosts.length} post(s) (${posts.length} published, ${allPosts.length - posts.length} drafts).`);

if (!fs.existsSync(POSTS_OUT_DIR)) fs.mkdirSync(POSTS_OUT_DIR);

fs.writeFileSync(path.join(OUT_DIR, "blog.html"), generateListing(posts));
console.log("✓ Generated blog.html");

// dashboard.html is manually maintained — do not overwrite it here

posts.forEach(post => {
  fs.writeFileSync(path.join(POSTS_OUT_DIR, `${post.slug}.html`), generatePost(post, posts));
  console.log(`✓ Generated blog-posts/${post.slug}.html`);
});

console.log("\nDone. Open Portfolio/blog.html in your browser.");
