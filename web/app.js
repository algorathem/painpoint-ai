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
    .map((row, ri) => {
      let eids = row.evidence_ids || [];
      let evidence = eids.map((id) => idMap[id]).filter(Boolean);
      // If model omitted ids, attach top true pains as evidence so drawer still has links
      if (!evidence.length) {
        evidence = truePains.slice(ri * 2, ri * 2 + 4);
        eids = evidence.map((e) => e.id);
      }
      const subs = new Set(evidence.map((e) => e.subreddit).filter(Boolean));
      const quotes = evidence.slice(0, 4).map(toQuote);
      const idea = {
        id: `idea-${(row.title || "x").slice(0, 24)}-${eids[0] || Math.random().toString(36).slice(2, 7)}`,
        title: row.title || "Untitled",
        problem: row.problem || synthesizeProblem(evidence),
        who: row.who || guessWho(evidence),
        why_now: row.why_now || "Repeated public complaints with no clear product winner.",
        evidence_count: Math.max(eids.length, evidence.length),
        evidence_urls: evidence.map((e) => e.url).filter(Boolean).slice(0, 8),
        evidence_items: evidence.slice(0, 8).map(toEvidenceItem),
        quotes,
        categories: row.categories || [],
        score: Number(row.score || 0),
        wtp: row.wtp || majority(evidence.map((e) => e.willingness_to_pay), "medium"),
        sentiment: row.sentiment || majority(evidence.map((e) => e.sentiment), "frustrated"),
        severity: Number(row.severity || avg(evidence.map((e) => e.severity)) || 3),
        reach_subs: subs.size || 1,
      };
      idea.sam_m = estimateSam(idea);
      idea.validation = buildValidation(idea);
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

function snip(text, n = 180) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

function toQuote(item) {
  const body = snip(item.body || item.description || "", 220);
  const title = snip(item.title || "", 120);
  return {
    text: body || title,
    title,
    subreddit: item.subreddit || "",
    url: item.url || "",
    score: item.score || 0,
    wtp: item.willingness_to_pay || inferWtp(`${item.title}\n${item.body || ""}`),
    sentiment: item.sentiment || inferSentiment(`${item.title}\n${item.body || ""}`),
  };
}

function toEvidenceItem(item) {
  return {
    id: item.id,
    title: item.title || item.description || "(untitled)",
    body: snip(item.body || item.description || "", 280),
    subreddit: item.subreddit || "",
    url: item.url || "",
    score: item.score || 0,
    num_comments: item.num_comments || 0,
    source: item.source || "post",
    wtp: item.willingness_to_pay || inferWtp(`${item.title}\n${item.body || ""}`),
    sentiment: item.sentiment || inferSentiment(`${item.title}\n${item.body || ""}`),
    severity: item.severity || 0,
    phrases: item.matched_phrases || [],
  };
}

function synthesizeProblem(items) {
  if (!items.length) return "No concrete problem text available.";
  const top = [...items].sort(
    (a, b) => (b.score || 0) + (b.num_comments || 0) - ((a.score || 0) + (a.num_comments || 0))
  )[0];
  const quote = snip(top.body || top.description || top.title, 200);
  const who = guessWho(items);
  return `${who} report: “${quote}” (${items.length} related threads across ${new Set(items.map((i) => i.subreddit)).size} subreddits).`;
}

function guessWho(items) {
  const subs = items.map((i) => (i.subreddit || "").toLowerCase());
  if (subs.some((s) => s.includes("devops") || s.includes("sre"))) return "Platform / FinOps engineers";
  if (subs.some((s) => s.includes("sales"))) return "Sales ops and AEs";
  if (subs.some((s) => s.includes("smallbusiness") || s.includes("entrepreneur"))) return "SMB owners and operators";
  if (subs.some((s) => s.includes("startups") || s === "saas")) return "SaaS founders and operators";
  return "Operators in the scanned communities";
}

function titleFromItems(phrase, items) {
  const top = [...items].sort((a, b) => (b.score || 0) - (a.score || 0))[0];
  const t = (top?.title || "").replace(/^\(comment\)\s*/i, "");
  // Prefer a product-shaped title from the strongest post when possible
  if (t && t.length > 12 && t.length < 90 && !/^tired of|^why is|^i wish/i.test(t)) {
    return t;
  }
  const map = {
    "i'd pay for": "Paid fix for a recurring workflow gap",
    "looking for a tool": "Missing tool buyers are actively hunting",
    "is there a tool": "Unmet tool search with no clear winner",
    "spreadsheet hell": "Spreadsheet replacement for a broken ops process",
    "takes forever": "Time-sink automation for a manual bottleneck",
    bottleneck: "Bottleneck remover for a stuck workflow",
    "need automation": "Automation layer for a repetitive manual job",
  };
  return map[phrase] || `Product angle: ${phrase}`;
}

function buildValidation(idea) {
  const hasLinks = (idea.evidence_urls || []).filter(Boolean).length >= 2;
  const hasQuote = (idea.quotes || []).some((q) => (q.text || "").length > 40);
  const wtpOk = idea.wtp === "high" || idea.wtp === "medium";
  return [
    {
      id: "evidence",
      label: "≥2 independent Reddit threads with links",
      pass: hasLinks,
    },
    {
      id: "quote",
      label: "At least one concrete user quote (not just a title)",
      pass: hasQuote,
    },
    {
      id: "wtp",
      label: "WTP signal is medium or high (not pure venting)",
      pass: wtpOk,
    },
    {
      id: "reach",
      label: "Appears in ≥2 subreddits OR ≥3 evidence posts",
      pass: (idea.reach_subs || 0) >= 2 || (idea.evidence_count || 0) >= 3,
    },
    {
      id: "severity",
      label: "Severity ≥3 (blocks real work / money / time)",
      pass: (idea.severity || 0) >= 3,
    },
  ];
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
      const sorted = [...items].sort(
        (a, b) => (b.score || 0) + (b.num_comments || 0) * 2 - ((a.score || 0) + (a.num_comments || 0) * 2)
      );
      const blob = sorted.map((x) => `${x.title}\n${x.body || ""}`).join("\n");
      const idea = {
        id: `idea-h-${i}-${phrase.slice(0, 12)}`,
        title: titleFromItems(phrase, sorted),
        problem: synthesizeProblem(sorted),
        who: guessWho(sorted),
        why_now: `“${phrase}” shows up repeatedly; no dominant solution named in-thread.`,
        evidence_count: sorted.length,
        evidence_urls: sorted.slice(0, 8).map((x) => x.url).filter(Boolean),
        evidence_items: sorted.slice(0, 8).map(toEvidenceItem),
        quotes: sorted.slice(0, 4).map(toQuote),
        categories: [phrase],
        score: Math.max(40, 90 - i * 6 + Math.min(12, sorted.length * 2)),
        wtp: inferWtp(blob),
        sentiment: inferSentiment(blob),
        severity: Math.min(5, 2 + Math.round(Math.log2(1 + sorted.length))),
        reach_subs: new Set(sorted.map((x) => x.subreddit)).size,
      };
      idea.sam_m = estimateSam(idea);
      idea.validation = buildValidation(idea);
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
    ideas.forEach((idea, idx) => {
      const sc = idea.score || 0;
      const scCls = sc >= 80 ? "hi" : sc >= 60 ? "mid" : "lo";
      const wtp = idea.wtp || "medium";
      const sent = idea.sentiment || "frustrated";
      const topUrl = (idea.evidence_urls || []).find(Boolean) || "";
      const quote = (idea.quotes && idea.quotes[0] && idea.quotes[0].text) || "";
      const tr = document.createElement("tr");
      tr.className = "hov";
      tr.tabIndex = 0;
      tr.dataset.kind = "idea";
      tr.dataset.idx = String(idx);
      tr.innerHTML = `
        <td>
          <div class="t-name">${escapeHtml(idea.title)}<span class="open-hint">open →</span></div>
          <div class="t-why">${escapeHtml((idea.who || "").slice(0, 90))}</div>
        </td>
        <td><span class="score ${scCls}">${Math.round(sc)}</span></td>
        <td>
          <div>${escapeHtml((idea.problem || "").slice(0, 180))}</div>
          ${quote ? `<div class="t-why" style="margin-top:4px">“${escapeHtml(quote.slice(0, 100))}”</div>` : ""}
          <div class="bar"><i style="width:${Math.min(100, sc)}%;background:var(--${sc >= 80 ? "emerald" : sc >= 60 ? "amber" : "faint"})"></i></div>
        </td>
        <td><span class="tag wtp-${wtp === "high" ? "high" : wtp === "medium" ? "mid" : "low"}">${escapeHtml(wtp)}</span></td>
        <td><span class="tag sent-${escapeAttr(sent)}">${escapeHtml(sent)}</span></td>
        <td><div class="mv">$${idea.sam_m || 0}M SAM</div></td>
        <td>
          <div class="mv">${idea.evidence_count || 0} posts</div>
          <div class="mv" style="margin-top:2px">${idea.reach_subs || 1} subs</div>
          ${topUrl ? `<div style="margin-top:4px"><a class="linkish" href="${escapeAttr(topUrl)}" target="_blank" rel="noopener" data-stop="1">top thread ↗</a></div>` : ""}
        </td>`;
      tr.addEventListener("click", (e) => {
        if (e.target.closest("[data-stop]")) return;
        openIdeaDrawer(idea);
      });
      tr.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openIdeaDrawer(idea);
        }
      });
      tbody.appendChild(tr);
    });
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
    .slice(0, 10);
  if (!ranked.length) {
    painEl.innerHTML = '<div class="empty-inline">No pains yet.</div>';
  } else {
    const maxSev = Math.max(...ranked.map((p) => p.severity || 1), 1);
    painEl.innerHTML = `
      <div class="legend">
        <span><i style="background:var(--emerald)"></i>high severity</span>
        <span><i style="background:var(--amber)"></i>medium</span>
        <span><i style="background:var(--faint)"></i>low</span>
        <span style="color:var(--faint)">click a row for full quote + Reddit link</span>
      </div>`;
    ranked.forEach((p, i) => {
      const sev = p.severity || 1;
      const width = Math.round((sev / Math.max(5, maxSev)) * 100);
      const color = sev >= 4 ? "var(--emerald)" : sev >= 3 ? "var(--amber)" : "var(--faint)";
      const snippet = snip(p.body || p.description || "", 140);
      const div = document.createElement("div");
      div.className = "pain";
      div.tabIndex = 0;
      div.innerHTML = `
        <div class="rank">${i + 1}</div>
        <div class="body">
          <div class="txt">${escapeHtml(p.description || p.title)}</div>
          ${snippet && snippet !== (p.description || p.title) ? `<div class="meta" style="color:var(--muted)">“${escapeHtml(snippet)}”</div>` : ""}
          <div class="meta">r/${escapeHtml(p.subreddit || "?")} · ${escapeHtml(p.willingness_to_pay || "—")} WTP · ${escapeHtml(p.sentiment || "—")} · ${
            p.url
              ? `<a href="${escapeAttr(p.url)}" target="_blank" rel="noopener" data-stop="1">open Reddit ↗</a>`
              : "no link"
          } · <span class="linkish">details →</span></div>
        </div>
        <div class="bar"><i style="width:${width}%;background:${color}"></i></div>`;
      const open = () => openPainDrawer(p);
      div.addEventListener("click", (e) => {
        if (e.target.closest("[data-stop]")) return;
        open();
      });
      div.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      });
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
      row.style.cursor = "pointer";
      const w = Math.round(((idea.sam_m || 0) / maxSam) * 100);
      row.innerHTML = `
        <div class="top"><span class="name">${escapeHtml(idea.title)}</span><span class="val">$${idea.sam_m || 0}M</span></div>
        <div class="bar"><i style="width:${w}%;background:var(--emerald)"></i></div>`;
      row.addEventListener("click", () => openIdeaDrawer(idea));
      samEl.appendChild(row);
    }
    const note = document.createElement("p");
    note.className = "note";
    note.textContent =
      "Click a bar to open evidence. SAM = evidence × severity × WTP × rough ARPU — directional only.";
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

function closeDrawer() {
  const d = $("drawer");
  const b = $("drawer-backdrop");
  if (d) {
    d.hidden = true;
    d.setAttribute("aria-hidden", "true");
  }
  if (b) b.hidden = true;
}

function openDrawerShell(kind, title, bodyHtml) {
  $("drawer-kind").textContent = kind;
  $("drawer-title").textContent = title;
  $("drawer-body").innerHTML = bodyHtml;
  $("drawer").hidden = false;
  $("drawer").setAttribute("aria-hidden", "false");
  $("drawer-backdrop").hidden = false;
}

function openIdeaDrawer(idea) {
  const checks = (idea.validation || buildValidation(idea))
    .map(
      (c) =>
        `<li><input type="checkbox" ${c.pass ? "checked" : ""} disabled /><div><strong style="color:${c.pass ? "var(--emerald)" : "var(--amber)"}">${c.pass ? "Pass" : "Gap"}</strong> — ${escapeHtml(c.label)}</div></li>`
    )
    .join("");
  const quotes = (idea.quotes || [])
    .filter((q) => q.text)
    .slice(0, 4)
    .map(
      (q) => `
      <div class="quote-block">
        <div class="q">“${escapeHtml(q.text)}”</div>
        <div class="src">r/${escapeHtml(q.subreddit || "?")} · ${escapeHtml(q.wtp || "")} WTP · ${
          q.url ? `<a href="${escapeAttr(q.url)}" target="_blank" rel="noopener">open thread ↗</a>` : "no url"
        }</div>
      </div>`
    )
    .join("");
  const evidence = (idea.evidence_items || [])
    .slice(0, 8)
    .map(
      (e) => `
      <div class="ev-item">
        <div class="title">${escapeHtml(e.title)}</div>
        <div class="meta">r/${escapeHtml(e.subreddit)} · ${e.source} · score ${e.score} · ${escapeHtml(e.wtp)} WTP · ${escapeHtml(e.sentiment)}</div>
        ${e.body ? `<div class="snip">${escapeHtml(e.body)}</div>` : ""}
        ${e.url ? `<div style="margin-top:6px"><a href="${escapeAttr(e.url)}" target="_blank" rel="noopener">Open on Reddit ↗</a></div>` : "<div class='snip'>No permalink available</div>"}
      </div>`
    )
    .join("");
  const searchQ = encodeURIComponent(
    `${idea.title} ${idea.who || ""} SaaS tool`.slice(0, 80)
  );
  const body = `
    <div class="drawer-section">
      <h3>Problem (concrete)</h3>
      <div class="problem-block">${escapeHtml(idea.problem || "—")}</div>
    </div>
    <div class="drawer-section">
      <h3>Snapshot</h3>
      <div class="drawer-kv">
        <div class="box"><div class="k">Buyer</div><div class="v">${escapeHtml(idea.who || "—")}</div></div>
        <div class="box"><div class="k">Score / SAM</div><div class="v">${Math.round(idea.score || 0)} · $${idea.sam_m || 0}M</div></div>
        <div class="box"><div class="k">WTP / Sentiment</div><div class="v">${escapeHtml(idea.wtp || "—")} · ${escapeHtml(idea.sentiment || "—")}</div></div>
        <div class="box"><div class="k">Evidence / reach</div><div class="v">${idea.evidence_count || 0} posts · ${idea.reach_subs || 1} subs</div></div>
      </div>
      <p class="note" style="margin-top:8px">${escapeHtml(idea.why_now || "")}</p>
    </div>
    <div class="drawer-section">
      <h3>User quotes</h3>
      ${quotes || '<div class="empty-inline">No long-form body quotes — open evidence links below.</div>'}
    </div>
    <div class="drawer-section">
      <h3>Evidence threads</h3>
      <div class="ev-list">${evidence || '<div class="empty-inline">No evidence items attached.</div>'}</div>
    </div>
    <div class="drawer-section">
      <h3>Validation checklist</h3>
      <ul class="check-list">${checks}</ul>
      <div class="drawer-actions">
        ${(idea.evidence_urls || [])
          .filter(Boolean)
          .slice(0, 3)
          .map(
            (u, i) =>
              `<a class="btn ghost" href="${escapeAttr(u)}" target="_blank" rel="noopener">Thread ${i + 1} ↗</a>`
          )
          .join("")}
        <a class="btn ghost" href="https://www.reddit.com/search/?q=${searchQ}" target="_blank" rel="noopener">More on Reddit ↗</a>
        <a class="btn ghost" href="https://www.google.com/search?q=${searchQ}" target="_blank" rel="noopener">Competitor search ↗</a>
      </div>
    </div>`;
  openDrawerShell("Startup idea · validation", idea.title || "Idea", body);
}

function openPainDrawer(p) {
  const blob = `${p.title || ""}\n${p.body || ""}`;
  const full = snip(p.body || p.description || p.title || "", 600);
  const body = `
    <div class="drawer-section">
      <h3>What they said</h3>
      <div class="problem-block">${escapeHtml(full || p.title || "—")}</div>
    </div>
    <div class="drawer-section">
      <h3>Snapshot</h3>
      <div class="drawer-kv">
        <div class="box"><div class="k">Subreddit</div><div class="v">r/${escapeHtml(p.subreddit || "?")}</div></div>
        <div class="box"><div class="k">Type</div><div class="v">${escapeHtml(p.source || "post")}</div></div>
        <div class="box"><div class="k">WTP</div><div class="v">${escapeHtml(p.willingness_to_pay || inferWtp(blob))}</div></div>
        <div class="box"><div class="k">Sentiment</div><div class="v">${escapeHtml(p.sentiment || inferSentiment(blob))}</div></div>
        <div class="box"><div class="k">Severity / score</div><div class="v">${p.severity || "—"} / ${p.score || 0}</div></div>
        <div class="box"><div class="k">Comments</div><div class="v">${p.num_comments || 0}</div></div>
      </div>
    </div>
    <div class="drawer-section">
      <h3>Matched phrases</h3>
      <div>${(p.matched_phrases || []).map((x) => `<span class="tag cat">${escapeHtml(x)}</span>`).join(" ") || "—"}</div>
    </div>
    <div class="drawer-section">
      <h3>Go deeper</h3>
      <div class="drawer-actions">
        ${p.url ? `<a class="btn" href="${escapeAttr(p.url)}" target="_blank" rel="noopener">Open Reddit thread ↗</a>` : ""}
        <a class="btn ghost" href="https://www.reddit.com/r/${escapeAttr(p.subreddit || "SaaS")}/" target="_blank" rel="noopener">Browse r/${escapeHtml(p.subreddit || "SaaS")} ↗</a>
        <a class="btn ghost" href="https://www.reddit.com/search/?q=${encodeURIComponent(p.title || p.description || "")}" target="_blank" rel="noopener">Search similar ↗</a>
      </div>
      ${p.description && p.description !== p.title ? `<p class="note" style="margin-top:10px">LLM summary: ${escapeHtml(p.description)}</p>` : ""}
    </div>`;
  openDrawerShell("Pain signal · evidence", p.title || p.description || "Pain", body);
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
  $("drawer-close")?.addEventListener("click", closeDrawer);
  $("drawer-backdrop")?.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDrawer();
  });
}

boot();
