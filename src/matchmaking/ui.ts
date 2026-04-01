/**
 * DevPool Directory — Matchmaking UI
 *
 * Generates a self-contained HTML page that implements the matchmaking
 * interface: signs in with a GitHub PAT, scrapes closed issues, scores
 * available tasks, and streams ranked results.
 */

export const MATCHMAKING_UI_HTML = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>DevPool Directory — Matchmaking</title>
<style>
  :root {
    --bg: #0d1117;
    --surface: #161b22;
    --border: #30363d;
    --text: #e6edf3;
    --muted: #7d8590;
    --accent: #238636;
    --accent-hover: #2ea043;
    --link: #58a6ff;
    --price: #f0883e;
    --danger: #da3633;
    --badge: #1f6feb;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; min-height: 100vh; }

  /* Header */
  header { border-bottom: 1px solid var(--border); padding: 1rem 2rem; display: flex; align-items: center; gap: 1rem; background: var(--surface); }
  header h1 { font-size: 1.2rem; font-weight: 600; }
  header .subtitle { color: var(--muted); font-size: 0.85rem; }
  .beta-badge { background: var(--badge); color: #fff; font-size: 0.7rem; padding: 2px 7px; border-radius: 999px; font-weight: 600; }

  /* Auth panel */
  .auth-panel { max-width: 560px; margin: 4rem auto; text-align: center; padding: 2rem; }
  .auth-panel h2 { margin-bottom: 0.5rem; }
  .auth-panel p { color: var(--muted); margin-bottom: 1.5rem; font-size: 0.9rem; }
  .token-input { width: 100%; padding: 0.7rem 1rem; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--text); font-size: 0.9rem; outline: none; }
  .token-input:focus { border-color: var(--link); }
  .btn { padding: 0.6rem 1.4rem; border-radius: 8px; border: none; font-size: 0.9rem; font-weight: 600; cursor: pointer; transition: background 0.15s; }
  .btn-primary { background: var(--accent); color: #fff; }
  .btn-primary:hover { background: var(--accent-hover); }
  .btn-ghost { background: transparent; color: var(--link); border: 1px solid var(--border); }
  .btn-ghost:hover { background: var(--surface); }
  .error-msg { color: var(--danger); font-size: 0.85rem; margin-top: 0.5rem; text-align: left; }

  /* Main layout */
  .main { display: flex; min-height: calc(100vh - 60px); }
  .sidebar { width: 260px; border-right: 1px solid var(--border); padding: 1.5rem; background: var(--surface); overflow-y: auto; }
  .content { flex: 1; overflow-y: auto; padding: 1.5rem 2rem; }

  /* User profile */
  .user-profile { display: flex; align-items: center; gap: 0.7rem; margin-bottom: 1.5rem; padding-bottom: 1.5rem; border-bottom: 1px solid var(--border); }
  .avatar { width: 40px; height: 40px; border-radius: 50%; }
  .user-info { font-size: 0.85rem; }
  .user-info .name { font-weight: 600; }
  .user-info .stats { color: var(--muted); font-size: 0.8rem; }
  .logout-btn { font-size: 0.75rem; color: var(--muted); background: none; border: none; cursor: pointer; text-decoration: underline; }

  /* Skill badges */
  .skill-section h3 { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin-bottom: 0.7rem; }
  .skill-badges { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 1.5rem; }
  .skill-badge { background: rgba(31,111,235,0.2); color: var(--link); font-size: 0.72rem; padding: 2px 7px; border-radius: 4px; }
  .skill-badge.matched { background: rgba(35,134,54,0.2); color: #3fb950; }

  /* Controls */
  .controls { display: flex; flex-direction: column; gap: 0.7rem; margin-bottom: 1.5rem; }
  .controls select, .controls input { width: 100%; padding: 0.5rem; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text); font-size: 0.85rem; }
  .filter-group { display: flex; gap: 0.5rem; }
  .filter-group select { flex: 1; }

  /* Task list */
  .task-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
  .task-header h2 { font-size: 1rem; }
  .task-count { color: var(--muted); font-size: 0.85rem; }
  .stream-indicator { display: flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; color: var(--muted); }
  .stream-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); animation: pulse 1.5s infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }

  /* Task cards */
  .task-list { display: flex; flex-direction: column; gap: 0.75rem; }
  .task-card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 1rem 1.2rem; cursor: pointer; transition: border-color 0.15s, transform 0.1s; position: relative; overflow: hidden; }
  .task-card:hover { border-color: var(--link); transform: translateY(-1px); }
  .task-card::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; border-radius: 10px 0 0 10px; background: var(--accent); }
  .task-card.stream-in { animation: slideIn 0.3s ease-out; }
  @keyframes slideIn { from { opacity: 0; transform: translateX(-10px); } to { opacity: 1; transform: translateX(0); } }

  .task-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 0.5rem; }
  .task-title { font-size: 0.9rem; font-weight: 600; line-height: 1.3; flex: 1; }
  .task-title a { color: var(--text); text-decoration: none; }
  .task-title a:hover { color: var(--link); text-decoration: underline; }
  .task-score { font-size: 1.4rem; font-weight: 700; color: var(--accent); min-width: 40px; text-align: right; }
  .task-score .max { font-size: 0.7rem; color: var(--muted); font-weight: 400; }

  .task-meta { display: flex; gap: 0.8rem; align-items: center; flex-wrap: wrap; font-size: 0.8rem; color: var(--muted); }
  .task-repo { color: var(--link); }
  .task-price { color: var(--price); font-weight: 600; }
  .task-time { background: rgba(255,255,255,0.05); padding: 1px 6px; border-radius: 4px; }
  .task-assigned { color: var(--danger); }

  .task-skills { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 0.6rem; }
  .match-badge { background: rgba(35,134,54,0.15); color: #3fb950; font-size: 0.7rem; padding: 1px 6px; border-radius: 3px; }

  .task-actions { margin-top: 0.7rem; display: flex; gap: 0.5rem; }
  .task-actions a { font-size: 0.8rem; color: var(--link); text-decoration: none; padding: 0.3rem 0.7rem; border: 1px solid var(--border); border-radius: 5px; }
  .task-actions a:hover { background: var(--bg); }

  /* Empty / loading */
  .state-message { text-align: center; padding: 3rem; color: var(--muted); }
  .spinner { width: 32px; height: 32px; border: 3px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 1rem; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* Progress bar */
  .progress-bar { height: 3px; background: var(--border); border-radius: 2px; margin-bottom: 1.5rem; overflow: hidden; }
  .progress-fill { height: 100%; background: var(--accent); transition: width 0.3s ease; width: 0%; }

  /* Responsive */
  @media (max-width: 768px) {
    .main { flex-direction: column; }
    .sidebar { width: 100%; border-right: none; border-bottom: 1px solid var(--border); }
    .content { padding: 1rem; }
  }
</style>
</head>
<body>

<header>
  <h1>DevPool Directory</h1>
  <span class="subtitle">AI-Powered Task Matchmaking</span>
  <span class="beta-badge">BETA</span>
</header>

<div id="app"></div>

<script>
const OWNER = "devpool-directory";
const REPO = "devpool-directory";
const STORAGE_BRANCH = "__STORAGE__";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ─── State ──────────────────────────────────────────────────────────────────
let token = localStorage.getItem("gh_token") || "";
let user = null;
let artifacts = { issues: [], mirrorState: {}, loaded: false };
let userProfile = null;
let matchedTasks = [];
let filter = { sort: "match", minPrice: 0, onlyUnassigned: false };

// ─── GitHub API ──────────────────────────────────────────────────────────────
async function ghFetch(path, opts = {}) {
  const res = await fetch(\`https://api.github.com\${path}\`, {
    ...opts,
    headers: {
      Authorization: \`Bearer \${token}\`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || \`HTTP \${res.status}\`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function getJsonFromStorage(path) {
  const res = await fetch(
    \`https://api.github.com/repos/\${OWNER}/\${REPO}/contents/\${path}?ref=\${STORAGE_BRANCH}\`,
    { headers: { Accept: "application/vnd.github+json" } }
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(\`Failed to fetch \${path}: \${res.status}\`);
  const body = await res.json();
  return JSON.parse(atob(body.content));
}

async function loadArtifacts() {
  const [issues, mirrorState] = await Promise.all([
    getJsonFromStorage("partner-open-issues.json"),
    getJsonFromStorage("mirror-state.json"),
  ]);
  artifacts = { issues: issues || [], mirrorState: mirrorState || {}, loaded: true };
}

async function fetchUserClosedIssues(username) {
  const issues = [];
  let page = 1;
  while (true) {
    const data = await ghFetch(
      \`/search/issues?q=author:\${username}+is:issue+is:closed+per_page=100&page=\${page}\`
    );
    issues.push(...(data.items || []));
    if (!data.items || data.items.length < 100 || page >= 3) break;
    page++;
  }
  return issues.map((i) => ({
    owner: i.repository_url.split("/").slice(-2)[0],
    repo: i.repository_url.split("/").slice(-1)[0],
    number: i.number,
    node_id: i.node_id,
    title: i.title,
    url: i.html_url,
    body: i.body || "",
    labels: (i.labels || []).map((l) => l.name),
    assignees: (i.assignees || []).map((a) => a.login),
    state: "closed",
    created_at: i.created_at,
    updated_at: i.updated_at,
  }));
}

// ─── Scoring ─────────────────────────────────────────────────────────────────
const SKILL_KEYWORDS = [
  "typescript","javascript","rust","go","python","solidity","vyper","java","c++","c#","ruby","php","swift","kotlin","scala",
  "html","css","scss","sql","graphql","assembly","react","vue","angular","svelte","nextjs","nuxt","express","fastify","nestjs",
  "django","flask","rails","laravel","ethers","hardhat","foundry","wagmi","viem","web3js","ubiquity","@ubiquity-os/plugin-template",
  "github","git","docker","kubernetes","aws","gcp","azure","circleci","github-actions","gitlab-ci","jenkins","postgresql",
  "mysql","redis","mongodb","elasticsearch","terraform","ansible","prometheus","grafana","smart-contract","defi","dao","nft",
  "token","staking","api","rest","websocket","grpc","microservices","ci/cd","devops","testing","security","audit",
  "machine-learning","ai","llm","nlp","refactoring","clean-code","tdd","code-review","agile",
];

function tokenize(text) {
  return text.toLowerCase().replace(/[^a-z0-9\\s-]/g, " ").split(/\\s+/).filter(w => w.length > 2);
}

function buildSkillProfile(issues) {
  const freq = new Map();
  for (const issue of issues) {
    const combined = issue.title + " " + (issue.body || "") + " " + issue.labels.join(" ");
    const tokens = tokenize(combined);
    for (const kw of SKILL_KEYWORDS) {
      const count = tokens.filter(t => t.includes(kw)).length;
      if (count > 0) freq.set(kw, (freq.get(kw) || 0) + count);
    }
    freq.set(issue.owner.toLowerCase(), (freq.get(issue.owner.toLowerCase()) || 0) + 1);
    freq.set((\`\${issue.owner}/\${issue.repo}\`).toLowerCase(), (freq.get((\`\${issue.owner}/\${issue.repo}\`).toLowerCase()) || 0) + 1);
  }
  return freq;
}

function extractPrice(labels) {
  for (const l of labels) {
    const m = l.match(/price:\\s*\\$?\\s*([\\d,]+(?:\\.\\d{2})?)/i);
    if (m) return parseFloat(m[1].replace(",",""));
  }
  return null;
}

function extractTime(labels) {
  for (const l of labels) {
    if (l.toLowerCase().startsWith("time:")) return l.slice(5).trim();
  }
  return null;
}

function scoreTask(task, profile) {
  const combined = task.title + " " + (task.body || "") + " " + task.labels.join(" ");
  const tokens = tokenize(combined);
  const matched = [];
  let score = 0;
  for (const [kw, weight] of profile) {
    if (tokens.some(t => t.includes(kw))) {
      score += weight;
      matched.push(kw);
    }
  }
  const price = extractPrice(task.labels);
  if (price !== null) score += Math.log10(price + 1) * 5;
  if (extractTime(task.labels)) score += 3;
  if (task.assignees.length > 0) score -= 5;
  return { score, matched: [...new Set(matched)].slice(0, 6) };
}

function rankTasks(tasks, profile, mirrorState) {
  return tasks
    .filter(t => t.state === "open")
    .map(task => {
      const { score, matched } = scoreTask(task, profile);
      return { issue: task, score, matchedSkills: matched, directoryUrl: mirrorState[task.node_id]?.directory_issue_url };
    })
    .sort((a, b) => b.score - a.score);
}

// ─── Rendering ───────────────────────────────────────────────────────────────
function render() {
  const app = $("#app");
  if (!user) { app.innerHTML = renderAuth(); bindAuth(); return; }
  app.innerHTML = renderMain();
  bindMain();
}

function renderAuth() {
  return \`
  <div class="auth-panel">
    <h2>🔗 Connect GitHub</h2>
    <p>Sign in with a GitHub Personal Access Token to get personalized task matches based on your completed work.</p>
    <input class="token-input" type="password" id="token-input" placeholder="ghp_xxxxxxxxxxxxxxxxxxxx" value="\${token}" />
    <div style="margin-top:0.8rem">
      <button class="btn btn-primary" id="login-btn">Sign In & Analyze My Work</button>
    </div>
    <div class="error-msg" id="auth-error"></div>
    <p style="margin-top:1rem;font-size:0.78rem;color:var(--muted)">
      Your token is stored locally and only used to fetch your GitHub data.
    </p>
  </div>\`;
}

function renderMain() {
  const topSkills = userProfile
    ? [...userProfile.skillKeywords.entries()].sort((a,b)=>b[1]-a[1]).slice(0,12).map(([k])=>k)
    : [];

  return \`
  <div class="main">
    <div class="sidebar">
      <div class="user-profile">
        <img class="avatar" src="\${user.avatar_url}" alt="\${user.login}" />
        <div class="user-info">
          <div class="name">@\${user.login}</div>
          <div class="stats">\${userProfile?.closedIssues.length || 0} closed issues analyzed</div>
        </div>
        <button class="logout-btn" id="logout-btn">logout</button>
      </div>

      <div class="skill-section">
        <h3>Your Skills (from closed work)</h3>
        <div class="skill-badges" id="skill-badges">
          \${topSkills.map(s => \`<span class="skill-badge">\${s}</span>\`).join("")}
        </div>
      </div>

      <div class="controls">
        <h3 style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--muted);margin-bottom:0.5rem">Filters</h3>
        <select id="sort-select">
          <option value="match" \${filter.sort==="match"?"selected":""}>🎯 Best Match</option>
          <option value="price-high" \${filter.sort==="price-high"?"selected":""}>💰 Highest Price</option>
          <option value="price-low" \${filter.sort==="price-low"?"selected":""}>💵 Lowest Price</option>
          <option value="newest" \${filter.sort==="newest"?"selected":""}>🕐 Newest</option>
        </select>
        <div class="filter-group">
          <select id="min-price">
            <option value="0">Any price</option>
            <option value="100">≥$100</option>
            <option value="500">≥$500</option>
            <option value="1000">≥$1,000</option>
          </select>
        </div>
        <label style="font-size:0.82rem;color:var(--muted);display:flex;align-items:center;gap:0.4rem">
          <input type="checkbox" id="unassigned-only" \${filter.onlyUnassigned?"checked":""} />
          Unassigned only
        </label>
      </div>

      <div style="margin-top:auto;padding-top:1rem;border-top:1px solid var(--border)">
        <p style="font-size:0.72rem;color:var(--muted)">Data from <code style="color:var(--link)">\${OWNER}/\${REPO}</code> @\${STORAGE_BRANCH}</p>
      </div>
    </div>

    <div class="content">
      <div class="progress-bar"><div class="progress-fill" id="progress-fill"></div></div>
      <div class="task-header">
        <h2>🎯 Matched Tasks</h2>
        <span class="task-count" id="task-count"></span>
      </div>
      <div id="stream-status" class="stream-indicator" style="margin-bottom:1rem;display:none">
        <span class="stream-dot"></span>
        <span id="stream-text">Analyzing...</span>
      </div>
      <div class="task-list" id="task-list">
        <div class="state-message" id="list-state">
          <div class="spinner"></div>
          <p>Loading tasks...</p>
        </div>
      </div>
    </div>
  </div>\`;
}

function renderTaskCard(result) {
  const { issue, score, matchedSkills, directoryUrl } = result;
  const price = extractPrice(issue.labels);
  const time = extractTime(issue.labels);
  const maxScore = matchedTasks.length > 0 ? matchedTasks[0].score : 1;
  const scorePct = Math.round((score / maxScore) * 100);

  return \`
  <div class="task-card">
    <div class="task-top">
      <div class="task-title">
        <a href="\${issue.url}" target="_blank">\${issue.title}</a>
      </div>
      <div class="task-score" title="Match score">
        \${Math.round(score)}
        <span class="max">/\${Math.round(maxScore)}</span>
      </div>
    </div>
    <div class="task-meta">
      <span class="task-repo">\${issue.owner}/\${issue.repo}#\${issue.number}</span>
      \${price !== null ? \`<span class="task-price">\${price >= 1000 ? "$"+(price/1000).toFixed(1)+"k" : "$"+price}</span>\` : ""}
      \${time ? \`<span class="task-time">⏱ \${time}</span>\` : ""}
      \${issue.assignees.length > 0 ? \`<span class="task-assigned">👤 \${issue.assignees.join(", ")}</span>\` : ""}
    </div>
    \${matchedSkills.length > 0 ? \`
    <div class="task-skills">
      \${matchedSkills.map(s => \`<span class="match-badge">\${s}</span>\`).join("")}
    </div>\` : ""}
    <div class="task-actions">
      <a href="\${issue.url}" target="_blank">View Issue ↗</a>
      \${directoryUrl ? \`<a href="\${directoryUrl}" target="_blank">Directory Mirror ↗</a>\` : ""}
    </div>
  </div>\`;
}

function bindAuth() {
  $("#login-btn")?.addEventListener("click", async () => {
    const input = $("#token-input");
    const errEl = $("#auth-error");
    const btn = $("#login-btn");
    if (!input) return;
    const t = input.value.trim();
    if (!t) { errEl.textContent = "Please enter a token."; return; }
    errEl.textContent = "";
    btn.disabled = true;
    btn.textContent = "Signing in...";
    try {
      const u = await ghFetch("/user");
      user = u;
      token = t;
      localStorage.setItem("gh_token", t);
      await runMatchmaking();
    } catch (e) {
      errEl.textContent = "Authentication failed: " + e.message;
      btn.disabled = false;
      btn.textContent = "Sign In & Analyze My Work";
    }
  });
}

function bindMain() {
  $("#logout-btn")?.addEventListener("click", () => {
    user = null;
    userProfile = null;
    matchedTasks = [];
    localStorage.removeItem("gh_token");
    render();
  });

  $("#sort-select")?.addEventListener("change", (e) => {
    filter.sort = e.target.value;
    applyFiltersAndRender();
  });

  $("#min-price")?.addEventListener("change", (e) => {
    filter.minPrice = parseInt(e.target.value) || 0;
    applyFiltersAndRender();
  });

  $("#unassigned-only")?.addEventListener("change", (e) => {
    filter.onlyUnassigned = e.target.checked;
    applyFiltersAndRender();
  });
}

async function runMatchmaking() {
  render(); // show main UI with loading state

  try {
    // Load artifacts
    const streamStatus = $("#stream-status");
    const streamText = $("#stream-text");
    const progressFill = $("#progress-fill");
    if (streamStatus) streamStatus.style.display = "flex";
    if (streamText) streamText.textContent = "Loading task data...";

    await loadArtifacts();
    if (progressFill) progressFill.style.width = "20%";

    // Fetch user's closed issues
    if (streamText) streamText.textContent = "Fetching your closed issues...";
    const closedIssues = await fetchUserClosedIssues(user.login);
    if (progressFill) progressFill.style.width = "50%";

    // Build profile
    if (streamText) streamText.textContent = "Building skill profile...";
    const skillKeywords = buildSkillProfile(closedIssues);
    userProfile = { login: user.login, avatarUrl: user.avatar_url, closedIssues, skillKeywords };

    // Score and rank
    if (streamText) streamText.textContent = "Scoring tasks...";
    matchedTasks = rankTasks(artifacts.issues, userProfile.skillKeywords, artifacts.mirrorState);
    if (progressFill) progressFill.style.width = "90%";

    // Stream render
    if (streamStatus) streamStatus.style.display = "none";
    if (progressFill) progressFill.style.width = "100%";

    applyFiltersAndRender();
  } catch (e) {
    console.error("Matchmaking error:", e);
    const listState = $("#list-state");
    if (listState) listState.innerHTML = \`<div class="state-message"><p style="color:var(--danger)">Error: \${e.message}</p></div>\`;
  }
}

function applyFiltersAndRender() {
  let tasks = [...matchedTasks];

  // Apply filters
  if (filter.minPrice > 0) {
    tasks = tasks.filter(t => extractPrice(t.issue.labels) >= filter.minPrice);
  }
  if (filter.onlyUnassigned) {
    tasks = tasks.filter(t => t.issue.assignees.length === 0);
  }

  // Apply sort
  if (filter.sort === "price-high") {
    tasks.sort((a, b) => (extractPrice(b.issue.labels) || 0) - (extractPrice(a.issue.labels) || 0));
  } else if (filter.sort === "price-low") {
    tasks.sort((a, b) => (extractPrice(a.issue.labels) || 0) - (extractPrice(b.issue.labels) || 0));
  } else if (filter.sort === "newest") {
    tasks.sort((a, b) => new Date(b.issue.created_at) - new Date(a.issue.created_at));
  }
  // else "match" — already sorted by score

  const listEl = $("#task-list");
  const countEl = $("#task-count");
  if (!listEl) return;

  if (tasks.length === 0) {
    listEl.innerHTML = \`<div class="state-message"><p>No tasks match your filters. Try adjusting them.</p></div>\`;
  } else {
    listEl.innerHTML = tasks.map(r => renderTaskCard(r)).join("");
  }
  if (countEl) countEl.textContent = \`\${tasks.length} tasks\`;
}

// ─── Init ─────────────────────────────────────────────────────────────────────
(async function init() {
  if (token) {
    try {
      user = await ghFetch("/user");
    } catch (_) {
      localStorage.removeItem("gh_token");
      token = "";
    }
  }
  render();
  if (user) runMatchmaking();
})();
</script>
</body>
</html>`;

export function generateMatchmakingPage(): string {
  return MATCHMAKING_UI_HTML;
}
