/**
 * Painpoint AI — Analyst Cockpit
 * Arctic Shift + phrase filter + optional BYOK LLM + WTP/sentiment/SAM scoring
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

const WTP_HIGH_RE =
  /\b(i'?d pay|i would pay|shut up and take|take my money|worth \$?\d|happy to pay|will pay|paying for|budget for|roi)\b/i;
const WTP_MID_RE =
  /\b(looking for a (tool|app|software)|is there a (tool|app)|need a (tool|app|way)|recommend a|anyone know a)\b/i;
const HOPE_RE =
  /\b(looking for|is there|wish there|need a tool|need an app|any recommendations|recommend)\b/i;
const FRUST_RE =
  /\b(hate|frustrated|frustrating|sick of|fed up|nightmare|broken|useless|terrible|awful)\b/i;
const ANNOY_RE =
  /\b(annoying|annoyed|tedious|waste of time|takes forever|manual|painful)\b/i;

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
    body: "Same 15 questions every day in Intercom. Need automation for tier-1 but everything we tried hallucinates or sounds robotic. Anyone else struggling? I'd pay for something that doesn't sound like a bot.",
    score: 210,
    num_comments: 67,
    url: "https://www.reddit.com/r/startups/comments/demo3/",
  },
  {
    id: "demo4",
    source: "post",
    subreddit: "devops",
    title: "Why is there no good cost anomaly alert for multi-cloud?",
    body: "AWS Budgets is useless for our K8s spike patterns. Looking for an app that explains *why* spend jumped, not just that it did. Happy to pay for FinOps tooling that works.",
    score: 95,
    num_comments: 28,
    url: "https://www.reddit.com/r/devops/comments/demo4/",
  },
  {
    id: "demo5",
    source: "post",
    subreddit: "sales",
    title: "CRM hygiene is a waste of time",
    body: "Reps hate manually logging calls. We need automation that writes notes from Gong without wrecking Salesforce validation rules.",
    score: 73,
    num_comments: 19,
    url: "https://www.reddit.com/r/sales/comments/demo5/",
  },
];

/** @type {Set<string>} */
const selected = new Set(["SaaS", "Entrepreneur", "startups"]);

/** @type {null | object} */
let lastResult = null;
let lastScannedCount = 0;

const $ = (id) => document.getElementById(id);

function matchPhrases(text) {
  const lowered = (text || "").toLowerCase();
  const hits = PAIN_PHRASES.filter((p) => lowered.includes(p));
  if (hits.length) return hits;
  const soft = SOFT.filter((p) => lowered.includes(p));
  return soft.length >= 2 ? soft : [];
}

function inferWtp(text, llmWtp) {
  if (llmWtp && ["high", "medium", "low"].includes(String(llmWtp).toLowerCase())) {
    return String(llmWtp).toLowerCase();
  }
  const t = text || "";
  if (WTP_HIGH_RE.test(t)) return "high";
  if (WTP_MID_RE.test(t)) return "medium";
  return "low";
}

function inferSentiment(text) {
  const t = text || "";
  if (HOPE_RE.test(t) && (FRUST_RE.test(t) || ANNOY_RE.test(t) || WTP_HIGH_RE.test(t))) {
    return "hopeful";
  }
  if (FRUST_RE.test(t)) return "frustrated";
  if (ANNOY_RE.test(t)) return "annoyed";
  if (HOPE_RE.test(t)) return "hopeful";
  return "neutral";
}

function estimateSam(idea, pains) {
  // Directional niche SAM heuristic (USD millions)
  const wtp = idea.wtp || "medium";
  const wtpMul = wtp === "high" ? 1 : wtp === "medium" ? 0.55 : 0.15;
  const sev = idea.severity || 3;
  const evidence = Math.max(1, idea.evidence_count || 1);
  const reach = Math.max(1, idea.reach_subs || 1);
  const baseBuyers = 800 + evidence * 420 + reach * 900;
  const arpu = 40 + sev * 18 + (wtp === "high" ? 35 : 0);
  const sam = Math.round((baseBuyers * arpu * 12 * wtpMul) / 1e6);
  return Math.max(1, sam);
}

function setStatus(msg, kind = "") {
  const el = $("status");
  if (!el) return;
  el.textContent = msg;
  el.className = "status" + (kind ? ` ${kind}` : "");
}

function setPill(id, text, cls = "") {
  const el = $(id);
  if (!el) return;
  el.textContent = text;
  el.className = "pill" + (cls ? ` ${cls}` : "");
}

function normalizeSub(s) {
  return s.trim().replace(/^r\//i, "").replace(/\s+/g, "");
}

function updateHeaderPills() {
  const subs = [...selected];
  setPill(
    "pill-subs",
    subs.length ? subs.slice(0, 4).map((s) => `r/${s}`).join(" · ") + (subs.length > 4 ? " +" : "") : "no subs"
  );
  const days = Number($("days")?.value || 30);
  setPill("pill-window", `${days}d`, "warn");
}

function renderPresets() {
  const row = $("preset-row");
  if (!row) return;
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
      updateHeaderPills();
    });
    row.appendChild(b);
  }
}

function renderSelected() {
  const row = $("selected-subs");
  if (!row) return;
  row.innerHTML = "";
  if (!selected.size) {
    row.innerHTML = `<span class="empty-inline">No subreddits selected.</span>`;
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
      updateHeaderPills();
    });
    row.appendChild(b);
  }
}

function addSubFromInput() {
  const name = normalizeSub($("sub-input").value);
  if (!name) return;
  selected.add(name);
  $("sub-input").value = "";
  renderPresets();
  renderSelected();
  updateHeaderPills();
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
    const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
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
  let body = (p.selftext || "").trim();
  if (body === "[removed]" || body === "[deleted]") body = "";
  const blob = `${title}\n${body}`;
  const phrases = matchPhrases(blob);
  if (!phrases.length) return null;
  return {
    id: String(p.id || title.slice(0, 40)),
    source: "post",
    subreddit: String(p.subreddit || ""),
    title,
    body: body.slice(0, 4000),
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
  let scanned = 0;
  for (const sub of subs) {
    setStatus(`Fetching r/${sub} posts…`);
    setPill("pill-status", `r/${sub}`, "live");
    const posts = await arcticGet("/api/posts/search", {
      subreddit: sub,
      limit,
      after,
      before: now,
    });
    scanned += posts.length;
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
      scanned += cs.length;
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
  lastScannedCount = scanned;
  items.sort((a, b) => b.score + b.num_comments * 2 - (a.score + a.num_comments * 2));
  return items;
}

async function classifyItem(item, { base, key, model }) {
  const system = `You are a B2B SaaS opportunity analyst.
Return STRICT JSON only:
{"is_pain":boolean,"description":"one sentence","category":"workflow|automation|integration|reporting|sales|support|compliance|finance|hr|devops|marketing|other","severity":1-5,"willingness_to_pay":"low|medium|high|unknown","sentiment":"frustrated|annoyed|hopeful|neutral","idea_seed":"short product angle","confidence":0-1}
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
      max_tokens: 400,
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
  const blob = `${item.title}\n${item.body || ""}`;
  return {
    ...item,
    is_pain: !!parsed.is_pain,
    description: parsed.description || "",
    category: parsed.category || "other",
    severity: Number(parsed.severity || 0),
    willingness_to_pay: inferWtp(blob, parsed.willingness_to_pay),
    sentiment: parsed.sentiment || inferSentiment(blob),
    idea_seed: parsed.idea_seed || "",
    confidence: Number(parsed.confidence || 0),
  };
}

async function clusterIdeas(pains, { base, key, model }) {
  const truePains = pains.filter((p) => p.is_pain);
  if (!truePains.length) return [];
  const lines = truePains.slice(0, 40).map(
    (p, i) =>
      `- id=${p.id || "e" + i} | r/${p.subreddit} | sev=${p.severity} | cat=${p.category} | wtp=${p.willingness_to_pay} | sent=${p.sentiment} | ${p.description} | seed=${p.idea_seed} | url=${p.url}`
  );
  const system = `Cluster Reddit pain points into startup ideas. STRICT JSON:
{"ideas":[{"title":"...","problem":"...","who":"...","why_now":"...","evidence_ids":["id"],"categories":["..."],"score":0-100,"wtp":"high|medium|low","sentiment":"frustrated|annoyed|hopeful|neutral","severity":1-5}]}
Max 8 ideas. Only use provided evidence ids. Prefer high-WTP clusters.`;
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
      max_tokens: 2000,
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
      const evidence = eids.map((id) => idMap[id]).filter(Boolean);
      const subs = new Set(evidence.map((e) => e.subreddit).filter(Boolean));
      const idea = {
        title: row.title || "Untitled",
        problem: row.problem || "",
        who: row.who || "",
        why_now: row.why_now || "",
        evidence_count: eids.length || evidence.length,
        evidence_urls: evidence.map((e) => e.url).filter(Boolean).slice(0, 8),
        categories: row.categories || [],
        score: Number(row.score || 0),
        wtp: row.wtp || majority(evidence.map((e) => e.willingness_to_pay), "medium"),
        sentiment: row.sentiment || majority(evidence.map((e) => e.sentiment), "frustrated"),
        severity: Number(row.severity || avg(evidence.map((e) => e.severity)) || 3),
        reach_subs: subs.size || 1,
      };
      idea.sam_m = estimateSam(idea);
      return idea;
    })
    .sort((a, b) => b.score - a.score);
}

function majority(arr, fallback) {
  const counts = {};
  for (const x of arr.filter(Boolean)) counts[x] = (counts[x] || 0) + 1;
  let best = fallback;
  let n = 0;
  for (const [k, v] of Object.entries(counts)) {
    if (v > n) {
      best = k;
      n = v;
    }
  }
  return best;
}

function avg(nums) {
  const a = nums.filter((n) => typeof n === "number" && n > 0);
  if (!a.length) return 0;
  return a.reduce((s, n) => s + n, 0) / a.length;
}

function heuristicIdeas(candidates) {
  const buckets = new Map();
  for (const c of candidates) {
    const key = (c.matched_phrases && c.matched_phrases[0]) || "general";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(c);
  }
  return [...buckets.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 8)
    .map(([phrase, items], i) => {
      const blob = items.map((x) => `${x.title}\n${x.body || ""}`).join("\n");
      const idea = {
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
        wtp: inferWtp(blob),
        sentiment: inferSentiment(blob),
        severity: 3,
        reach_subs: new Set(items.map((x) => x.subreddit)).size,
      };
      idea.sam_m = estimateSam(idea);
      return idea;
    });
}

function enrichPains(pains) {
  return pains.map((p) => {
    const blob = `${p.title || ""}\n${p.body || ""}\n${p.description || ""}`;
    return {
      ...p,
      willingness_to_pay: inferWtp(blob, p.willingness_to_pay),
      sentiment: p.sentiment || inferSentiment(blob),
      severity: p.severity || 3,
    };
  });
}

function setArc(id, len, offset) {
  const el = $(id);
  if (!el) return;
  el.setAttribute("stroke-dasharray", `${len} 314`);
  el.setAttribute("stroke-dashoffset", String(-offset));
}

function renderCockpit({ candidates, pains, ideas, scanned }) {
  lastResult = { candidates, pains, ideas, scanned };
  $("export-json").disabled = false;
  $("export-md").disabled = false;

  const confirmed = pains.filter((p) => p.is_pain);
  const wtpHigh = confirmed.filter((p) => p.willingness_to_pay === "high").length;
  const wtpMid = confirmed.filter((p) => p.willingness_to_pay === "medium").length;
  const wtpLow = confirmed.filter(
    (p) => p.willingness_to_pay === "low" || p.willingness_to_pay === "unknown"
  ).length;
  const topSam = ideas.slice(0, 5).reduce((s, i) => s + (i.sam_m || 0), 0);

  $("s-scanned").textContent = scanned ? scanned.toLocaleString() : String(candidates.length);
  $("s-hits").textContent = String(candidates.length);
  $("s-confirmed").textContent = String(confirmed.length);
  $("s-confirmed-d").textContent = candidates.length
    ? `${Math.round((confirmed.length / Math.max(1, candidates.length)) * 100)}% of hits`
    : "awaiting run";
  $("s-ideas").textContent = String(ideas.length);
  $("s-wtp").textContent = String(wtpHigh);
  $("s-wtp-d").textContent = confirmed.length
    ? `${Math.round((wtpHigh / confirmed.length) * 100)}% of confirmed`
    : "of confirmed";
  $("s-sam").textContent = topSam ? `$${topSam}M` : "—";
  $("pain-count-pill").textContent = `${confirmed.length} confirmed`;

  // WTP donut
  const total = Math.max(1, confirmed.length);
  const circ = 2 * Math.PI * 50; // ~314
  const highLen = (wtpHigh / total) * circ;
  const midLen = (wtpMid / total) * circ;
  const lowLen = (wtpLow / total) * circ;
  setArc("wtp-arc-high", highLen, 0);
  setArc("wtp-arc-mid", midLen, highLen);
  setArc("wtp-arc-low", lowLen, highLen + midLen);
  $("wtp-total").textContent = String(confirmed.length);
  $("wtp-high").textContent = String(wtpHigh);
  $("wtp-mid").textContent = String(wtpMid);
  $("wtp-low").textContent = String(wtpLow);
  $("wtp-note").textContent = confirmed.length
    ? `${Math.round((wtpHigh / total) * 100)}% show explicit or strong purchase intent. Frustration-only is down-weighted in idea scoring.`
    : "Run a scan to separate buyable problems from venting.";

  // Sentiment
  const sentCounts = { frustrated: 0, annoyed: 0, hopeful: 0, neutral: 0 };
  for (const p of confirmed.length ? confirmed : candidates) {
    const s = p.sentiment || inferSentiment(`${p.title}\n${p.body || ""}`);
    if (sentCounts[s] !== undefined) sentCounts[s]++;
    else sentCounts.neutral++;
  }
  const sentTotal = Math.max(
    1,
    Object.values(sentCounts).reduce((a, b) => a + b, 0)
  );
  for (const k of Object.keys(sentCounts)) {
    const pct = Math.round((sentCounts[k] / sentTotal) * 100);
    const bar = $(`sent-${k}`);
    const lab = $(`sent-${k}-p`);
    if (bar) bar.style.width = `${pct}%`;
    if (lab) lab.textContent = `${pct}%`;
  }

  // Ideas table
  const tbody = $("ideas-tbody");
  tbody.innerHTML = "";
  if (!ideas.length) {
    tbody.innerHTML =
      '<tr><td colspan="7" class="empty-row">No ideas yet. Add an LLM key for clustering, or run Demo.</td></tr>';
  } else {
    for (const idea of ideas) {
      const sc = idea.score || 0;
      const scCls = sc >= 80 ? "hi" : sc >= 60 ? "mid" : "lo";
      const wtp = idea.wtp || "medium";
      const sent = idea.sentiment || "frustrated";
      const tr = document.createElement("tr");
      tr.className = "hov";
      tr.innerHTML = `
        <td>
          <div class="t-name">${escapeHtml(idea.title)}</div>
          <div class="t-why">${escapeHtml((idea.who || idea.categories?.join(" · ") || "").slice(0, 80))}</div>
        </td>
        <td><span class="score ${scCls}">${Math.round(sc)}</span></td>
        <td>
          <div>${escapeHtml((idea.problem || "").slice(0, 160))}</div>
          <div class="bar"><i style="width:${Math.min(100, sc)}%;background:var(--${sc >= 80 ? "emerald" : sc >= 60 ? "amber" : "faint"})"></i></div>
        </td>
        <td><span class="tag wtp-${wtp === "high" ? "high" : wtp === "medium" ? "mid" : "low"}">${escapeHtml(wtp)}</span></td>
        <td><span class="tag sent-${escapeAttr(sent)}">${escapeHtml(sent)}</span></td>
        <td><div class="mv">$${idea.sam_m || 0}M SAM</div></td>
        <td>
          <div class="mv">${idea.evidence_count || 0} posts</div>
          <div class="mv" style="margin-top:2px">${idea.reach_subs || 1} subs</div>
        </td>`;
      tbody.appendChild(tr);
    }
  }

  // Pain ranking
  const painEl = $("pain-rank");
  const ranked = (confirmed.length ? confirmed : candidates.slice(0, 12))
    .slice()
    .sort((a, b) => {
      const sa = (a.severity || 1) * 10 + Math.log10(1 + (a.score || 0));
      const sb = (b.severity || 1) * 10 + Math.log10(1 + (b.score || 0));
      return sb - sa;
    })
    .slice(0, 8);
  if (!ranked.length) {
    painEl.innerHTML = '<div class="empty-inline">No pains yet.</div>';
  } else {
    const maxSev = Math.max(...ranked.map((p) => p.severity || 1), 1);
    painEl.innerHTML = `
      <div class="legend">
        <span><i style="background:var(--emerald)"></i>high severity</span>
        <span><i style="background:var(--amber)"></i>medium</span>
        <span><i style="background:var(--faint)"></i>low</span>
      </div>`;
    ranked.forEach((p, i) => {
      const sev = p.severity || 1;
      const width = Math.round((sev / Math.max(5, maxSev)) * 100);
      const color = sev >= 4 ? "var(--emerald)" : sev >= 3 ? "var(--amber)" : "var(--faint)";
      const div = document.createElement("div");
      div.className = "pain";
      div.innerHTML = `
        <div class="rank">${i + 1}</div>
        <div class="body">
          <div class="txt">${escapeHtml(p.description || p.title)}</div>
          <div class="meta">r/${escapeHtml(p.subreddit || "?")} · ${escapeHtml(p.willingness_to_pay || "—")} WTP · ${
            p.url ? `<a href="${escapeAttr(p.url)}" target="_blank" rel="noopener">view</a>` : "—"
          }</div>
        </div>
        <div class="bar"><i style="width:${width}%;background:${color}"></i></div>`;
      painEl.appendChild(div);
    });
  }

  // SAM list
  const samEl = $("sam-list");
  if (!ideas.length) {
    samEl.innerHTML = '<div class="empty-inline">No ideas yet.</div>';
  } else {
    const maxSam = Math.max(...ideas.map((i) => i.sam_m || 1), 1);
    samEl.innerHTML = "";
    for (const idea of ideas.slice(0, 5)) {
      const row = document.createElement("div");
      row.className = "sam-row";
      const w = Math.round(((idea.sam_m || 0) / maxSam) * 100);
      row.innerHTML = `
        <div class="top"><span class="name">${escapeHtml(idea.title)}</span><span class="val">$${idea.sam_m || 0}M</span></div>
        <div class="bar"><i style="width:${w}%;background:var(--emerald)"></i></div>`;
      samEl.appendChild(row);
    }
    const note = document.createElement("p");
    note.className = "note";
    note.textContent =
      "Method: evidence × severity × WTP multiplier × rough ARPU. Directional only — not a market survey.";
    samEl.appendChild(note);
  }

  // Source breakdown
  const srcEl = $("source-bars");
  const srcCounts = {};
  for (const c of candidates) {
    const s = c.subreddit || "unknown";
    srcCounts[s] = (srcCounts[s] || 0) + 1;
  }
  const srcEntries = Object.entries(srcCounts).sort((a, b) => b[1] - a[1]);
  const srcTotal = Math.max(1, candidates.length);
  if (!srcEntries.length) {
    srcEl.innerHTML = '<div class="empty-inline">No sources yet.</div>';
  } else {
    srcEl.innerHTML = "";
    for (const [sub, n] of srcEntries.slice(0, 8)) {
      const pct = Math.round((n / srcTotal) * 100);
      const row = document.createElement("div");
      row.className = "sent-row";
      row.innerHTML = `
        <span class="lbl" style="width:90px">r/${escapeHtml(sub)}</span>
        <div class="bar"><i style="width:${pct}%;background:var(--accent)"></i></div>
        <span class="pct">${pct}%</span>`;
      srcEl.appendChild(row);
    }
  }

  setPill("pill-status", "ready", "live");
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

async function runPipeline(candidates, scanned = 0) {
  const maxClassify = Number($("max-classify").value || 0);
  const llm = getLlmConfig();
  let pains = [];
  let ideas = [];

  if (llm && maxClassify > 0 && candidates.length) {
    const slice = candidates.slice(0, maxClassify);
    for (let i = 0; i < slice.length; i++) {
      setStatus(`LLM classify ${i + 1}/${slice.length}…`);
      setPill("pill-status", `llm ${i + 1}/${slice.length}`, "live");
      try {
        pains.push(await classifyItem(slice[i], llm));
      } catch (e) {
        setStatus(String(e.message || e), "err");
        pains = enrichPains(
          candidates.map((c) => ({
            ...c,
            is_pain: true,
            description: c.title,
            severity: 3,
            category: "other",
          }))
        );
        ideas = heuristicIdeas(candidates);
        renderCockpit({ candidates, pains, ideas, scanned });
        return;
      }
    }
    pains = enrichPains(pains);
    setStatus("Clustering ideas…");
    try {
      ideas = await clusterIdeas(pains, llm);
    } catch {
      ideas = heuristicIdeas(pains.filter((p) => p.is_pain));
    }
  } else {
    pains = enrichPains(
      candidates.map((c) => ({
        ...c,
        is_pain: true,
        description: c.title,
        severity: 3,
        category: "unscored",
      }))
    );
    ideas = heuristicIdeas(candidates);
    if (!llm) {
      setStatus("Done (phrase + heuristics — add LLM key for full classify).", "ok");
    } else {
      setStatus("Done.", "ok");
    }
  }
  renderCockpit({ candidates, pains, ideas, scanned: scanned || lastScannedCount });
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
  updateHeaderPills();
  try {
    const days = Number($("days").value || 30);
    const limit = Number($("limit").value || 40);
    const comments = $("comments").value === "1";
    setPill("pill-status", "scanning", "live");
    const candidates = await scanArctic(subs, { days, limit, comments });
    setStatus(`Phrase hits: ${candidates.length}. Processing…`);
    await runPipeline(candidates, lastScannedCount);
  } catch (e) {
    setStatus(String(e.message || e), "err");
    setPill("pill-status", "error", "err");
  } finally {
    $("run-scan").disabled = false;
    $("run-demo").disabled = false;
  }
}

async function onRunDemo() {
  $("run-scan").disabled = true;
  $("run-demo").disabled = true;
  try {
    setPill("pill-status", "demo", "live");
    const candidates = DEMO.map((d) => ({
      ...d,
      matched_phrases: matchPhrases(`${d.title}\n${d.body}`),
      created_utc: Date.now() / 1000,
    })).filter((d) => d.matched_phrases.length);
    lastScannedCount = DEMO.length;
    setStatus(`Demo fixtures: ${candidates.length}`);
    await runPipeline(candidates, DEMO.length);
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
  let md = `# Painpoint AI cockpit report\n\n`;
  md += `Candidates: ${candidates.length} · Confirmed: ${confirmed.length} · Ideas: ${ideas.length}\n\n`;
  md += `## Ideas\n\n`;
  for (const idea of ideas) {
    md += `### ${idea.title} (${Math.round(idea.score)}) · WTP ${idea.wtp} · ~$${idea.sam_m}M SAM\n`;
    md += `- Who: ${idea.who}\n- Problem: ${idea.problem}\n- Why now: ${idea.why_now}\n- Sentiment: ${idea.sentiment}\n`;
    for (const u of idea.evidence_urls || []) md += `- ${u}\n`;
    md += `\n`;
  }
  md += `## Pains\n\n`;
  for (const p of confirmed.length ? confirmed : candidates.slice(0, 20)) {
    md += `- r/${p.subreddit}: ${p.description || p.title} [${p.willingness_to_pay}/${p.sentiment}]\n  - ${p.url || ""}\n`;
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
  updateHeaderPills();
  $("sub-add").addEventListener("click", addSubFromInput);
  $("sub-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") addSubFromInput();
  });
  $("days").addEventListener("change", updateHeaderPills);
  $("save-llm").addEventListener("click", saveLlmSettings);
  $("clear-llm").addEventListener("click", clearLlmSettings);
  $("run-scan").addEventListener("click", onRunScan);
  $("run-demo").addEventListener("click", onRunDemo);
  $("export-json").addEventListener("click", exportJson);
  $("export-md").addEventListener("click", exportMd);
}

boot();
