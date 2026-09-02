/**
 * Painpoint AI — browser client
 * Data: Arctic Shift (CORS *) + optional OpenAI-compatible LLM (BYOK)
 */

const ARCTIC = "https://arctic-shift.photon-reddit.com";

const PRESETS = [
  "SaaS",
  "Entrepreneur",
  "startups",
  "smallbusiness",
  "freelance",
  "sales",
  "devops",
  "webdev",
  "marketing",
  "productivity",
  "climate",
  "sustainability",
  "ESG",
];

const PAIN_PHRASES = [
  "i wish there was",
  "i wish i could",
  "why is there no",
  "why isn't there",
  "looking for a tool",
  "looking for an app",
  "looking for software",
  "is there a tool",
  "is there an app",
  "is there a way",
  "does anyone know a",
  "can anyone recommend",
  "anyone else struggling",
  "tired of",
  "sick of",
  "fed up",
  "frustrated with",
  "frustrating",
  "hate manually",
  "manual process",
  "manually doing",
  "waste of time",
  "wastes so much time",
  "takes forever",
  "takes hours",
  "spending hours",
  "too expensive",
  "overpriced",
  "doesn't work",
  "does not work",
  "no good solution",
  "can't find a",
  "cannot find a",
  "struggling with",
  "how do you deal with",
  "how do you handle",
  "painful workflow",
  "bottleneck",
  "repetitive task",
  "need automation",
  "wish there was a tool",
  "i'd pay for",
  "i would pay for",
  "alternative to",
  "spreadsheet hell",
  "still using excel",
  "still using sheets",
  "copy paste",
  "copy-paste",
];

const SOFT = [
  "manual",
  "annoying",
  "frustrated",
  "workaround",
  "hacky",
  "time consuming",
  "time-consuming",
  "inefficient",
  "unreliable",
  "overwhelmed",
];

const DEMO = [
  {
    id: "demo0",
    source: "post",
    subreddit: "SaaS",
    title: "Tired of manually reconciling Stripe + NetSuite every month",
    body: "We spend 12 hours every close copying CSVs. Looking for a tool that syncs refunds and disputes without breaking our GL. I'd pay for something reliable.",
    score: 140,
    num_comments: 32,
    url: "https://www.reddit.com/r/SaaS/comments/demo0/",
  },
  {
    id: "demo1",
    source: "post",
    subreddit: "Entrepreneur",
    title: "I wish there was a simple way to track competitor pricing changes",
    body: "Checking 8 competitor sites weekly is a nightmare. Spreadsheet hell. Is there a tool that alerts on price drops for B2B SaaS pages?",
    score: 88,
    num_comments: 41,
    url: "https://www.reddit.com/r/Entrepreneur/comments/demo1/",
  },
  {
    id: "demo2",
    source: "comment",
    subreddit: "smallbusiness",
    title: "(comment) still using excel for inventory",
    body: "Frustrated with our POS — inventory counts never match. How do you handle multi-location stock without hiring full-time ops?",
    score: 22,
    num_comments: 0,
    url: "https://www.reddit.com/r/smallbusiness/comments/demo2/",
  },
  {
    id: "demo3",
    source: "post",
    subreddit: "startups",
    title: "Customer support is drowning us after launch",
    body: "Same 15 questions every day in Intercom. Need automation for tier-1 but everything we tried hallucinates or sounds robotic. Anyone else struggling?",
    score: 210,
    num_comments: 67,
    url: "https://www.reddit.com/r/startups/comments/demo3/",
  },
];

/** @type {Set<string>} */
const selected = new Set(["SaaS", "Entrepreneur", "startups"]);

/** @type {null | {candidates:any[], pains:any[], ideas:any[]}} */
let lastResult = null;

const $ = (id) => document.getElementById(id);

function matchPhrases(text) {
  const lowered = (text || "").toLowerCase();
  const hits = PAIN_PHRASES.filter((p) => lowered.includes(p));
  if (hits.length) return hits;
  const soft = SOFT.filter((p) => lowered.includes(p));
  return soft.length >= 2 ? soft : [];
}

function setStatus(msg, kind = "") {
  const el = $("status");
  el.textContent = msg;
  el.className = "status" + (kind ? ` ${kind}` : "");
}

function normalizeSub(s) {
  return s.trim().replace(/^r\//i, "").replace(/\s+/g, "");
}

function renderPresets() {
  const row = $("preset-row");
  row.innerHTML = "";
  for (const name of PRESETS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip" + (selected.has(name) ? " on" : "");
    b.textContent = `r/${name}`;
    b.addEventListener("click", () => {
      if (selected.has(name)) selected.delete(name);
      else selected.add(name);
      renderPresets();
      renderSelected();
    });
    row.appendChild(b);
  }
}

function renderSelected() {
  const row = $("selected-subs");
  row.innerHTML = "";
  if (!selected.size) {
    row.innerHTML = `<span class="hint">No subreddits selected.</span>`;
    return;
  }
  for (const name of [...selected].sort((a, b) => a.localeCompare(b))) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip on";
    b.innerHTML = `r/${name}<span class="x">×</span>`;
    b.title = "Remove";
    b.addEventListener("click", () => {
      selected.delete(name);
      renderPresets();
      renderSelected();
    });
    row.appendChild(b);
  }
}

function addSubFromInput() {
  const raw = $("sub-input").value;
  const name = normalizeSub(raw);
  if (!name) return;
  selected.add(name);
  $("sub-input").value = "";
  renderPresets();
  renderSelected();
}

function loadLlmSettings() {
  try {
    const raw = localStorage.getItem("painpoint_llm");
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s.base) $("llm-base").value = s.base;
    if (s.key) $("llm-key").value = s.key;
    if (s.model) $("llm-model").value = s.model;
  } catch {
    /* ignore */
  }
}

function saveLlmSettings() {
  const s = {
    base: $("llm-base").value.trim(),
    key: $("llm-key").value.trim(),
    model: $("llm-model").value.trim() || "gpt-4o-mini",
  };
  localStorage.setItem("painpoint_llm", JSON.stringify(s));
  setStatus("LLM settings saved in this browser only.", "ok");
}

function clearLlmSettings() {
  localStorage.removeItem("painpoint_llm");
  $("llm-base").value = "";
  $("llm-key").value = "";
  $("llm-model").value = "gpt-4o-mini";
  setStatus("LLM settings cleared.", "ok");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function arcticGet(path, params) {
  const url = new URL(path, ARCTIC);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      const data = await res.json();
      return data.data || [];
    }
    if (res.status === 422 || res.status === 429 || res.status === 503) {
      await sleep(1200 * (attempt + 1));
      continue;
    }
    const t = await res.text();
    throw new Error(`Arctic ${res.status}: ${t.slice(0, 160)}`);
  }
  return [];
}

function permalink(p) {
  const pl = p.permalink || "";
  if (pl.startsWith("http")) return pl;
  if (pl) return `https://www.reddit.com${pl}`;
  return p.url || "";
}

function postToItem(p) {
  const title = (p.title || "").trim();
  const body = (p.selftext || "").trim();
  if (body === "[removed]" || body === "[deleted]") {
    /* keep title only */
  }
  const cleanBody = body === "[removed]" || body === "[deleted]" ? "" : body;
  const blob = `${title}\n${cleanBody}`;
  const phrases = matchPhrases(blob);
  if (!phrases.length) return null;
  return {
    id: String(p.id || title.slice(0, 40)),
    source: "post",
    subreddit: String(p.subreddit || ""),
    title,
    body: cleanBody.slice(0, 4000),
    score: Number(p.score || 0),
    num_comments: Number(p.num_comments || 0),
    url: permalink(p),
    created_utc: Number(p.created_utc || 0),
    matched_phrases: phrases,
  };
}

function commentToItem(c) {
  const body = (c.body || "").trim();
  if (!body || body === "[removed]" || body === "[deleted]") return null;
  const phrases = matchPhrases(body);
  if (!phrases.length) return null;
  const linkId = String(c.link_id || "").replace("t3_", "");
  const sub = String(c.subreddit || "");
  const cid = String(c.id || "");
  const url = linkId
    ? `https://www.reddit.com/r/${sub}/comments/${linkId}/_/${cid}/`
    : "";
  return {
    id: cid || body.slice(0, 40),
    source: "comment",
    subreddit: sub,
    title: `(comment) ${body.slice(0, 80)}`,
    body: body.slice(0, 4000),
    score: Number(c.score || 0),
    num_comments: 0,
    url,
    created_utc: Number(c.created_utc || 0),
    matched_phrases: phrases,
  };
}

async function scanArctic(subs, { days, limit, comments }) {
  const now = Math.floor(Date.now() / 1000);
  const after = now - days * 86400;
  const items = [];
  const seen = new Set();
  for (const sub of subs) {
    setStatus(`Fetching r/${sub} posts…`);
    const posts = await arcticGet("/api/posts/search", {
      subreddit: sub,
      limit,
      after,
      before: now,
    });
    for (const p of posts) {
      const it = postToItem(p);
      if (it && !seen.has(it.id)) {
        seen.add(it.id);
        items.push(it);
      }
    }
    await sleep(350);
    if (comments) {
      setStatus(`Fetching r/${sub} comments…`);
      const cs = await arcticGet("/api/comments/search", {
        subreddit: sub,
        limit,
        after,
        before: now,
      });
      for (const c of cs) {
        const it = commentToItem(c);
        if (it && !seen.has(it.id)) {
          seen.add(it.id);
          items.push(it);
        }
      }
      await sleep(350);
    }
  }
  items.sort((a, b) => b.score + b.num_comments * 2 - (a.score + a.num_comments * 2));
  return items;
}

async function classifyItem(item, { base, key, model }) {
  const system = `You are a B2B SaaS opportunity analyst.
Return STRICT JSON only:
{"is_pain":boolean,"description":"one sentence","category":"workflow|automation|integration|reporting|sales|support|compliance|finance|hr|devops|marketing|other","severity":1-5,"willingness_to_pay":"low|medium|high|unknown","idea_seed":"short product angle","confidence":0-1}
If not a useful product pain, is_pain=false.`;
  const user = `type=${item.source}
subreddit=r/${item.subreddit}
score=${item.score} comments=${item.num_comments}
matched=${(item.matched_phrases || []).join("; ")}
url=${item.url}

TITLE: ${item.title}

BODY:
${(item.body || "").slice(0, 3000)}`;

  const url = `${base.replace(/\/$/, "")}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 350,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`LLM ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "{}";
  const m = text.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(m ? m[0] : "{}");
  return {
    ...item,
    is_pain: !!parsed.is_pain,
    description: parsed.description || "",
    category: parsed.category || "other",
    severity: Number(parsed.severity || 0),
    willingness_to_pay: parsed.willingness_to_pay || "unknown",
    idea_seed: parsed.idea_seed || "",
    confidence: Number(parsed.confidence || 0),
  };
}

async function clusterIdeas(pains, { base, key, model }) {
  const truePains = pains.filter((p) => p.is_pain);
  if (!truePains.length) return [];
  const lines = truePains.slice(0, 40).map(
    (p, i) =>
      `- id=${p.id || "e" + i} | r/${p.subreddit} | sev=${p.severity} | cat=${p.category} | ${p.description} | seed=${p.idea_seed} | url=${p.url}`
  );
  const system = `Cluster Reddit pain points into startup ideas. STRICT JSON:
{"ideas":[{"title":"...","problem":"...","who":"...","why_now":"...","evidence_ids":["id"],"categories":["..."],"score":0-100}]}
Max 8 ideas. Only use provided evidence ids.`;
  const url = `${base.replace(/\/$/, "")}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      max_tokens: 1800,
      messages: [
        { role: "system", content: system },
        { role: "user", content: `Evidence:\n${lines.join("\n")}` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`LLM cluster ${res.status}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "{}";
  const m = text.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(m ? m[0] : "{}");
  const idMap = Object.fromEntries(truePains.map((p) => [p.id, p]));
  return (parsed.ideas || [])
    .map((row) => {
      const eids = row.evidence_ids || [];
      return {
        title: row.title || "Untitled",
        problem: row.problem || "",
        who: row.who || "",
        why_now: row.why_now || "",
        evidence_count: eids.length,
        evidence_urls: eids.map((id) => idMap[id]?.url).filter(Boolean).slice(0, 8),
        categories: row.categories || [],
        score: Number(row.score || 0),
      };
    })
    .sort((a, b) => b.score - a.score);
}

function heuristicIdeas(candidates) {
  // No-LLM fallback: group by top phrase
  const buckets = new Map();
  for (const c of candidates) {
    const key = (c.matched_phrases && c.matched_phrases[0]) || "general";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(c);
  }
  return [...buckets.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 8)
    .map(([phrase, items], i) => ({
      title: `Tooling around “${phrase}”`,
      problem: items
        .slice(0, 3)
        .map((x) => x.title)
        .join(" · "),
      who: "Operators / founders in selected subs",
      why_now: "Repeated public complaints in selected communities",
      evidence_count: items.length,
      evidence_urls: items.slice(0, 5).map((x) => x.url),
      categories: ["other"],
      score: Math.max(40, 90 - i * 6 + Math.min(10, items.length)),
    }));
}

function renderResults({ candidates, pains, ideas }) {
  lastResult = { candidates, pains, ideas };
  $("export-json").disabled = false;
  $("export-md").disabled = false;

  const confirmed = pains.filter((p) => p.is_pain);
  $("summary").className = "summary";
  $("summary").innerHTML = `
    <strong>${candidates.length}</strong> phrase hits ·
    <strong>${confirmed.length}</strong> LLM-confirmed pains ·
    <strong>${ideas.length}</strong> idea clusters
  `;

  const ideasEl = $("ideas");
  ideasEl.innerHTML = "<h2 style='margin-top:0'>Startup ideas</h2>";
  if (!ideas.length) {
    ideasEl.innerHTML += `<p class="hint">No ideas yet. Add an LLM key for clustering, or broaden subreddits.</p>`;
  }
  for (const idea of ideas) {
    const card = document.createElement("article");
    card.className = "idea-card";
    card.innerHTML = `
      <h3><span class="score">${Math.round(idea.score)}</span> ${escapeHtml(idea.title)}</h3>
      <div class="meta"><strong>Who:</strong> ${escapeHtml(idea.who || "—")}</div>
      <div class="meta"><strong>Problem:</strong> ${escapeHtml(idea.problem || "—")}</div>
      <div class="meta"><strong>Why now:</strong> ${escapeHtml(idea.why_now || "—")}</div>
      <div class="meta">Evidence: ${idea.evidence_count || 0}
        ${(idea.evidence_urls || [])
          .slice(0, 3)
          .map((u) => `<div><a href="${escapeAttr(u)}" target="_blank" rel="noopener">${escapeHtml(u)}</a></div>`)
          .join("")}
      </div>
    `;
    ideasEl.appendChild(card);
  }

  const painsEl = $("pains");
  painsEl.innerHTML = "<h2>Pain signals</h2>";
  const list = confirmed.length
    ? confirmed.sort((a, b) => b.severity - a.severity)
    : candidates.slice(0, 25);
  for (const p of list) {
    const card = document.createElement("article");
    card.className = "pain-card";
    const head = p.description || p.title;
    card.innerHTML = `
      <div>
        ${p.severity ? `<span class="sev">${p.severity}/5 · ${escapeHtml(p.category || "")}</span> ` : ""}
        <strong>r/${escapeHtml(p.subreddit)}</strong> · ${escapeHtml(p.source || "post")}
      </div>
      <div class="meta">${escapeHtml(head)}</div>
      <div class="meta">phrases: ${escapeHtml((p.matched_phrases || []).join("; "))}</div>
      ${p.url ? `<a href="${escapeAttr(p.url)}" target="_blank" rel="noopener">${escapeHtml(p.url)}</a>` : ""}
    `;
    painsEl.appendChild(card);
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

function getLlmConfig() {
  const base = $("llm-base").value.trim();
  const key = $("llm-key").value.trim();
  const model = $("llm-model").value.trim() || "gpt-4o-mini";
  if (!base || !key) return null;
  return { base, key, model };
}

async function runPipeline(candidates) {
  const maxClassify = Number($("max-classify").value || 0);
  const llm = getLlmConfig();
  let pains = [];
  let ideas = [];

  if (llm && maxClassify > 0 && candidates.length) {
    const slice = candidates.slice(0, maxClassify);
    for (let i = 0; i < slice.length; i++) {
      setStatus(`LLM classify ${i + 1}/${slice.length}…`);
      try {
        pains.push(await classifyItem(slice[i], llm));
      } catch (e) {
        setStatus(String(e.message || e), "err");
        // continue with heuristic
        pains = candidates.map((c) => ({ ...c, is_pain: true, description: c.title, severity: 3, category: "other" }));
        ideas = heuristicIdeas(candidates);
        renderResults({ candidates, pains, ideas });
        return;
      }
    }
    setStatus("Clustering ideas…");
    try {
      ideas = await clusterIdeas(pains, llm);
    } catch {
      ideas = heuristicIdeas(pains.filter((p) => p.is_pain));
    }
  } else {
    pains = candidates.map((c) => ({
      ...c,
      is_pain: true,
      description: c.title,
      severity: 0,
      category: "unscored",
    }));
    ideas = heuristicIdeas(candidates);
    if (!llm) {
      setStatus("Done (phrase filter only — add LLM key for real classify).", "ok");
    } else {
      setStatus("Done.", "ok");
    }
  }
  renderResults({ candidates, pains, ideas });
  if (llm) setStatus("Done.", "ok");
}

async function onRunScan() {
  const subs = [...selected];
  if (!subs.length) {
    setStatus("Select at least one subreddit.", "err");
    return;
  }
  $("run-scan").disabled = true;
  $("run-demo").disabled = true;
  try {
    const days = Number($("days").value || 30);
    const limit = Number($("limit").value || 40);
    const comments = $("comments").value === "1";
    const candidates = await scanArctic(subs, { days, limit, comments });
    setStatus(`Phrase hits: ${candidates.length}. Processing…`);
    await runPipeline(candidates);
  } catch (e) {
    setStatus(String(e.message || e), "err");
  } finally {
    $("run-scan").disabled = false;
    $("run-demo").disabled = false;
  }
}

async function onRunDemo() {
  $("run-scan").disabled = true;
  $("run-demo").disabled = true;
  try {
    const candidates = DEMO.map((d) => ({
      ...d,
      matched_phrases: matchPhrases(`${d.title}\n${d.body}`),
      created_utc: Date.now() / 1000,
    })).filter((d) => d.matched_phrases.length);
    setStatus(`Demo fixtures: ${candidates.length}`);
    await runPipeline(candidates);
  } finally {
    $("run-scan").disabled = false;
    $("run-demo").disabled = false;
  }
}

function exportJson() {
  if (!lastResult) return;
  const blob = new Blob([JSON.stringify(lastResult, null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `painpoint-${Date.now()}.json`;
  a.click();
}

function exportMd() {
  if (!lastResult) return;
  const { ideas, pains, candidates } = lastResult;
  const confirmed = pains.filter((p) => p.is_pain);
  let md = `# Painpoint AI report\n\n`;
  md += `Candidates: ${candidates.length} · Confirmed: ${confirmed.length} · Ideas: ${ideas.length}\n\n`;
  md += `## Ideas\n\n`;
  for (const idea of ideas) {
    md += `### ${idea.title} (${Math.round(idea.score)})\n`;
    md += `- Who: ${idea.who}\n- Problem: ${idea.problem}\n- Why now: ${idea.why_now}\n`;
    for (const u of idea.evidence_urls || []) md += `- ${u}\n`;
    md += `\n`;
  }
  md += `## Pains\n\n`;
  for (const p of confirmed.length ? confirmed : candidates.slice(0, 20)) {
    md += `- r/${p.subreddit}: ${p.description || p.title}\n  - ${p.url || ""}\n`;
  }
  const blob = new Blob([md], { type: "text/markdown" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `painpoint-${Date.now()}.md`;
  a.click();
}

function boot() {
  renderPresets();
  renderSelected();
  loadLlmSettings();
  $("sub-add").addEventListener("click", addSubFromInput);
  $("sub-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") addSubFromInput();
  });
  $("save-llm").addEventListener("click", saveLlmSettings);
  $("clear-llm").addEventListener("click", clearLlmSettings);
  $("run-scan").addEventListener("click", onRunScan);
  $("run-demo").addEventListener("click", onRunDemo);
  $("export-json").addEventListener("click", exportJson);
  $("export-md").addEventListener("click", exportMd);
}

boot();
