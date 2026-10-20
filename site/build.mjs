// Builds the project website from the repo itself — nothing on the site is written by hand.
//   README.md            → home page (Thai) + /en/ (its "English" section)
//   every other root *.md → /docs/<name>/
//   docs/shots/*.png     → responsive WebP; package.json → stack versions; git → dates, commit
// Usage: SITE_TOOLS=<dir with marked + sharp installed> node site/build.mjs   (output: site/_site)
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, existsSync, copyFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.resolve(process.env.SITE_OUT || path.join(ROOT, "site/_site"));
const tools = createRequire(path.join(path.resolve(process.env.SITE_TOOLS || ROOT), "package.json"));
const { marked } = tools("marked");
const sharp = tools("sharp");

const read = (f) => readFileSync(path.join(ROOT, f), "utf8");
const git = (...a) => { try { return execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim(); } catch { return ""; } };
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const strip = (h) => String(h).replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}]️?|️/gu;
// Thai has no spaces between words, so browsers break headings mid-word; keep each space-separated phrase whole.
const phr = (t) => esc(t).split(/ +/).map((w) => `<span class="ph">${w}</span>`).join(" ");
const noEmoji = (s) => s.replace(EMOJI, "").replace(/\s{2,}/g, " ").trim();

// ---------- repo facts ----------
const pkg = JSON.parse(read("package.json"));
const remote = process.env.GITHUB_REPOSITORY || (git("remote", "get-url", "origin").match(/[:/]([^/:]+\/[^/]+?)(?:\.git)?$/) || [])[1] || "";
const [owner, repo] = remote.split("/");
const REPO_URL = `https://github.com/${owner}/${repo}`;
const SITE = (process.env.SITE_URL || `https://${owner}.github.io/${repo}/`).replace(/\/?$/, "/");
const BASE = new URL(SITE).pathname; // e.g. /deyecloud/
const head = { date: git("log", "-1", "--format=%cI"), sha: git("log", "-1", "--format=%h"), full: git("log", "-1", "--format=%H") };
const fileDate = (f) => git("log", "-1", "--format=%cI", "--", f) || head.date;
const branch = process.env.GITHUB_REF_NAME || git("rev-parse", "--abbrev-ref", "HEAD") || "main";
const blob = (f) => `${REPO_URL}/blob/main/${f}`;
const ver = (name) => { const v = (pkg.dependencies || {})[name] || (pkg.devDependencies || {})[name]; return v ? v.replace(/^[^\d]*/, "").split(".")[0] : null; };

// ---------- markdown helpers ----------
function splitBy(md, level) {
  const re = new RegExp(`^${"#".repeat(level)} (.+)$`);
  const out = []; let cur = { title: null, body: [] }; let fence = false;
  for (const line of md.split("\n")) {
    if (/^```/.test(line)) fence = !fence;
    const m = !fence && line.match(re);
    if (m) { out.push(cur); cur = { title: m[1].trim(), body: [] }; } else cur.body.push(line);
  }
  out.push(cur);
  return out.map((s) => ({ title: s.title, body: s.body.join("\n").replace(/^\s*---\s*$/gm, "").trim() }));
}
const section = (secs, pred) => secs.find((s) => s.title && pred(s.title));
function slug(text, seen) {
  let s = strip(text).toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, "").replace(/\s/g, "-");
  if (seen) { const n = seen.get(s) || 0; seen.set(s, n + 1); if (n) s += "-" + n; }
  return s;
}

// links between repo files become site links; other relative paths go to GitHub
const docFiles = readdirSync(ROOT).filter((f) => /\.md$/i.test(f) && f !== "README.md").sort();
const docSlug = (f) => f.replace(/\.md$/i, "").toLowerCase();
function rewriteLinks(html, from /* page path relative to site root, e.g. "" or "docs/deploy/" */) {
  const up = "../".repeat(from.split("/").filter(Boolean).length);
  return html.replace(/(href|src)="([^"]+)"/g, (all, attr, url) => {
    if (/^(https?:|mailto:|#|data:)/.test(url)) return all;
    const [p, hash = ""] = url.split("#");
    const clean = p.replace(/^\.\//, "").replace(/\?.*$/, "");
    if (clean === "README.md" || clean === "") return `${attr}="${up}${hash ? "#" + hash : ""}"`;
    if (docFiles.includes(clean)) return `${attr}="${up}docs/${docSlug(clean)}/${hash ? "#" + hash : ""}"`;
    return `${attr}="${(attr === "src" ? `${REPO_URL}/raw/main/` : `${REPO_URL}/blob/main/`)}${clean}${hash ? "#" + hash : ""}"`;
  });
}
// strip emoji outside <pre>/<code>, turn table tick marks into words
function tidy(html, lang) {
  const yes = lang === "th" ? "จำเป็น" : "required", no = lang === "th" ? "ไม่บังคับ" : "optional";
  return html.split(/(<pre[\s\S]*?<\/pre>|<code>[\s\S]*?<\/code>)/).map((part, i) => i % 2 ? part
    : part.replace(/<td>\s*✅\s*<\/td>/g, `<td><span class="req">${yes}</span></td>`).replace(/<td>\s*⬜\s*<\/td>/g, `<td><span class="opt">${no}</span></td>`)
      .replace(/(^|>)([^<]*)/g, (m, gt, txt) => gt + txt.replace(EMOJI, ""))).join("");
}
function mdToHtml(md, { from = "", lang = "th", ids = new Map(), toc = null } = {}) {
  const renderer = new marked.Renderer();
  renderer.heading = function ({ tokens, depth, text }) {
    const id = slug(text, ids);
    const inner = noEmoji(this.parser.parseInline(tokens));
    if (toc && depth === 2) toc.push({ id, text: strip(inner) });
    return `<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true" tabindex="-1">#</a>${inner}</h${depth}>\n`;
  };
  renderer.table = function (token) { return `<div class="table">${marked.Renderer.prototype.table.call(this, token)}</div>`; };
  let html = marked.parse(md, { renderer, gfm: true }).replace(techRe, () => techList("tech"));
  return tidy(rewriteLinks(html, from), lang);
}

// ---------- images: docs/shots → WebP at two widths ----------
const imgCache = new Map();
async function image(src, alt = "", { sizes = "100vw", eager = false, cls = "" } = {}) {
  const rel = src.replace(/\?.*$/, "").replace(/^\.\//, "");
  if (!imgCache.has(rel)) {
    const abs = path.join(ROOT, rel);
    if (!existsSync(abs)) throw new Error("missing image " + rel);
    const meta = await sharp(abs).metadata();
    const name = path.basename(rel).replace(/\.\w+$/, "");
    const big = Math.min(meta.width, 900), small = Math.round(big / 2);
    mkdirSync(path.join(OUT, "img"), { recursive: true });
    for (const w of [big, small]) await sharp(abs).resize({ width: w }).webp({ quality: 82 }).toFile(path.join(OUT, "img", `${name}-${w}.webp`));
    imgCache.set(rel, { name, big, small, h: Math.round(meta.height * big / meta.width), ratio: meta.height / meta.width });
  }
  const m = imgCache.get(rel);
  const tag = (pre) => `<img${cls ? ` class="${cls}"` : ""} src="${pre}img/${m.name}-${m.big}.webp" srcset="${pre}img/${m.name}-${m.small}.webp ${m.small}w, ${pre}img/${m.name}-${m.big}.webp ${m.big}w" sizes="${sizes}" width="${m.big}" height="${m.h}" alt="${esc(alt)}"${eager ? ' fetchpriority="high"' : ' loading="lazy" decoding="async"'}>`;
  return { ...m, tag };
}
const imgsIn = (html) => [...html.matchAll(/<img\b[^>]*>/g)].map((m) => ({ raw: m[0], src: (m[0].match(/src="([^"]+)"/) || [])[1], alt: (m[0].match(/alt="([^"]*)"/) || [])[1] || "" }));

// ---------- read README ----------
const readme = read("README.md");
const secs = splitBy(readme, 2);
const top = secs[0].body;
const h1 = strip((top.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || pkg.name);
const [nameTh, nameEn] = h1.split(/\s*·\s*/);
const introP = (top.match(/<p[^>]*>\s*<b>[\s\S]*?<\/p>/) || [""])[0];
const tagline = strip((introP.match(/<b>([\s\S]*?)<\/b>/) || [])[1] || "");
const subline = strip(introP.replace(/^[\s\S]*?<br>/, ""));
const deployUrl = (top.match(/href="(https:\/\/deploy\.workers\.cloudflare\.com[^"]+)"/) || [])[1];
const banner = (top.match(/<img src="(docs\/shots\/banner[^"]+)"/) || [])[1];

const why = section(secs, (t) => /ทำไม/.test(t));
const highlights = why ? [...why.body.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => ({
  title: noEmoji(strip((m[1].match(/<h3>([\s\S]*?)<\/h3>/) || [])[1] || "")), html: m[1].replace(/<h3>[\s\S]*?<\/h3>/, "").trim(),
})).filter((x) => x.title) : [];

const screensSec = section(secs, (t) => /ภาพหน้าจอ/.test(t));
const screens = screensSec ? [...screensSec.body.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => {
  const img = imgsIn(m[1])[0]; if (!img) return null;
  return { src: img.src, alt: img.alt, title: strip((m[1].match(/<b>([\s\S]*?)<\/b>/) || [])[1] || ""), sub: strip((m[1].match(/<sub>([\s\S]*?)<\/sub>/) || [])[1] || "") };
}).filter(Boolean) : [];
const screensText = screensSec ? screensSec.body.split(/\n\s*\n/).filter((b) => !/^\s*</.test(b) && b.trim()).join("\n\n") : "";

const featSec = section(secs, (t) => /ฟีเจอร์/.test(t));
const chapters = featSec ? splitBy(featSec.body, 3).filter((c) => c.title) : [];
const faqSec = section(secs, (t) => /คำถาม/.test(t));
const faqs = faqSec ? splitBy(faqSec.body, 3).filter((c) => c.title).map((c) => ({ q: c.title, a: c.body })) : [];
const installSec = section(secs, (t) => /ติดตั้ง/.test(t));
const settingsSec = section(secs, (t) => /ตั้งค่า/.test(t));
const archSec = section(secs, (t) => /สถาปัตยกรรม/.test(t));
const enSec = section(secs, (t) => /^English$/i.test(t));
// the README ends with a centred footer block after the last section — not part of it
for (const s of secs) s.body = s.body.replace(/\n<p align="center">[\s\S]*$/, "").trim();
const enParts = enSec ? splitBy(enSec.body, 3) : [];
const enIntro = enParts[0]?.body || "";
const enFaqPart = enParts.find((p) => /faq/i.test(p.title || ""));
const enFaqs = enFaqPart ? splitBy(enFaqPart.body, 4).filter((c) => c.title).map((c) => ({ q: c.title, a: c.body })) : [];
const enChapters = enParts.filter((p) => p.title && p !== enFaqPart);

// Tech stack = the README's icon row (<p class="tech">); versions looked up in package.json.
const techRe = /<p class="tech">([\s\S]*?)<\/p>/;
const tech = [...((readme.match(techRe) || [])[1] || "").matchAll(/<a href="([^"]+)"><img src="([^"]+)"[^>]*alt="([^"]+)"/g)].map(([, href, icon, name]) => ({ href, icon, name }));
const depFor = (name) => Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).find((d) => d === name.toLowerCase() || d === name.toLowerCase().replace(/\s+css$/, "css") || d === name.toLowerCase().replace(/\.js$/, ""));
const techVer = (name) => { const d = depFor(name); if (!d) return ""; const v = ({ ...pkg.dependencies, ...pkg.devDependencies })[d].replace(/^[^\d]*/, "").split("."); return v[0] === "0" ? v.slice(0, 2).join(".") : v[0]; };
const techList = (cls) => tech.length ? `<ul class="${cls}">${tech.map((t) => `<li><a href="${esc(t.href)}"><img src="${esc(t.icon)}" alt="" width="20" height="20" loading="lazy" decoding="async"><span>${esc(t.name)}</span>${techVer(t.name) ? `<em>${esc(techVer(t.name))}</em>` : ""}</a></li>`).join("")}</ul>` : "";

// ---------- page chrome ----------
const css = readFileSync(path.join(import.meta.dirname, "style.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s*\n\s*/g, "\n");
const fmtDate = (iso, lang) => iso ? new Date(iso).toLocaleDateString(lang === "th" ? "th-TH" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok" }) : "";
const L = {
  th: { skip: "ข้ามไปเนื้อหา", updated: "อัปเดตล่าสุด", docs: "คู่มือ", source: "ซอร์สโค้ด", other: "English", otherHref: "en/", edit: "แก้ไขหน้านี้บน GitHub", onThis: "ในหน้านี้", home: "หน้าแรก", full: "อ่านฉบับเต็ม", menu: "เมนูหลัก", commit: "คอมมิต" },
  en: { skip: "Skip to content", updated: "Last updated", docs: "Docs (Thai)", source: "Source code", other: "ภาษาไทย", otherHref: "", edit: "Edit this page on GitHub", onThis: "On this page", home: "Home", full: "Read the full guide (Thai)", menu: "Main menu", commit: "commit" },
};
const ghIcon = `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>`;

function page({ lang, rel, title, description, body, jsonld, alternates, nav, updated }) {
  const up = "../".repeat(rel.split("/").filter(Boolean).length);
  const url = SITE + rel;
  const t = L[lang];
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
${(alternates || []).map(([hl, u]) => `<link rel="alternate" hreflang="${hl}" href="${u}">`).join("\n")}
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="theme-color" content="#f6f5f1">
<meta property="og:type" content="${rel.startsWith("docs/") ? "article" : "website"}">
<meta property="og:site_name" content="${esc(nameTh)}">
<meta property="og:locale" content="${lang === "th" ? "th_TH" : "en_US"}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}og.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/svg+xml" href="${up}icon.svg">
<link rel="apple-touch-icon" href="${up}apple-touch-icon.png">
<link rel="alternate" type="text/plain" title="llms.txt" href="${SITE}llms.txt">
<link rel="sitemap" type="application/xml" href="${SITE}sitemap.xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;700;800&display=swap" media="print" onload="this.media='all'">
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;700;800&display=swap"></noscript>
${(jsonld || []).map((j) => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join("\n")}
<style>${css}</style>
</head>
<body>
<a class="skip" href="#main">${t.skip}</a>
<header class="bar">
  <div class="wrap bar-in">
    <a class="brand" href="${up}${lang === "en" ? "en/" : ""}"><img src="${up}icon.svg" alt="" width="28" height="28"><span>${esc(lang === "en" ? nameEn || nameTh : nameTh)}</span></a>
    <nav aria-label="${t.menu}">
      ${(nav || []).map(([label, href]) => `<a class="hide-sm" href="${href}">${esc(label)}</a>`).join("\n      ")}
      <a href="${up}${t.otherHref}" hreflang="${lang === "th" ? "en" : "th"}" lang="${lang === "th" ? "en" : "th"}">${t.other}</a>
      <a class="gh" href="${REPO_URL}">${ghIcon}<span>GitHub</span></a>
    </nav>
  </div>
</header>
<main id="main">
${body}
</main>
<footer class="foot">
  <div class="wrap foot-in">
    <div>
      <strong>${esc(h1)}</strong>
      <p>${t.updated} <time datetime="${updated || head.date}">${fmtDate(updated || head.date, lang)}</time> · ${t.commit} <a href="${REPO_URL}/commit/${head.full}"><code>${head.sha}</code></a></p>
    </div>
    <ul>
      <li><a href="${up}">${t.home}</a></li>
      ${docFiles.map((f) => `<li><a href="${up}docs/${docSlug(f)}/">${esc(docTitle(f))}</a></li>`).join("\n      ")}
      <li><a href="${REPO_URL}">${t.source}</a></li>
      <li><a href="${up}${t.otherHref}">${t.other}</a></li>
    </ul>
  </div>
</footer>
</body>
</html>
`;
}
function docTitle(f) { const m = read(f).match(/^# (.+)$/m); return noEmoji(strip(m ? m[1].split(/\s+—\s+/)[0] : f.replace(/\.md$/i, ""))); }

// ---------- structured data ----------
const appId = SITE + "#app";
const app = (lang, featureList) => ({
  "@context": "https://schema.org", "@type": "SoftwareApplication", "@id": appId,
  name: lang === "th" ? h1 : nameEn || h1, alternateName: [nameTh, nameEn, repo].filter(Boolean),
  description: lang === "th" ? `${tagline} ${subline}` : strip(marked.parse(enIntro.split("\n\n")[0] || "")),
  applicationCategory: "UtilitiesApplication", operatingSystem: "Web, Android, iOS (PWA)", inLanguage: "th",
  isAccessibleForFree: true, offers: { "@type": "Offer", price: "0", priceCurrency: lang === "th" ? "THB" : "USD" },
  softwareVersion: pkg.version, dateModified: head.date, url: SITE + (lang === "en" ? "en/" : ""),
  codeRepository: REPO_URL, downloadUrl: REPO_URL, screenshot: SITE + "og.jpg",
  featureList, author: { "@type": "Person", name: owner, url: `https://github.com/${owner}` },
});
const faqLd = (list, lang) => list.length ? { "@context": "https://schema.org", "@type": "FAQPage", inLanguage: lang,
  mainEntity: list.map((f) => ({ "@type": "Question", name: strip(f.q), acceptedAnswer: { "@type": "Answer", text: strip(marked.parse(f.a)) } })) } : null;
const boldTitles = (md) => [...md.matchAll(/^- \*\*(.+?)\*\*/gm)].map((m) => strip(m[1]));

// ---------- pages ----------
const pages = []; // { rel, date } for the sitemap
const faqHtml = (list, lang, from) => `<div class="faq">${list.map((f, i) => `<details${i ? "" : " open"}><summary>${phr(noEmoji(f.q))}</summary>${mdToHtml(f.a, { lang, from })}</details>`).join("")}</div>`;

async function chapterHtml(ch, i, lang, from) {
  let html = mdToHtml(ch.body, { lang, from });
  const shots = imgsIn(html); html = html.replace(/<p>\s*(<img\b[^>]*>\s*)+<\/p>/g, "").replace(/<img\b[^>]*>/g, "");
  const figs = [];
  for (const s of shots) {
    const src = decodeURIComponent(s.src.replace(`${REPO_URL}/raw/main/`, ""));
    figs.push(`<figure>${(await image(src, s.alt, { sizes: "(max-width:900px) 90vw, 360px" })).tag(from ? "../".repeat(from.split("/").filter(Boolean).length) : "")}</figure>`);
  }
  return `<article class="chapter${figs.length ? "" : " no-shots"}">
    <header><span class="num">${String(i + 1).padStart(2, "0")}</span><h3 id="${slug(ch.title)}">${phr(noEmoji(ch.title))}</h3></header>
    <div class="chapter-text">${html}</div>
    ${figs.length ? `<div class="chapter-shots">${figs.join("")}</div>` : ""}
  </article>`;
}

async function heroSwitch(items, pre) {
  if (!items.length) return "";
  const imgs = [];
  for (const [i, s] of items.entries()) imgs.push((await image(s.src, s.alt, { sizes: "(max-width:900px) 92vw, 540px", eager: i === 0, cls: `hs-img hs-${i}` })).tag(pre));
  const rules = items.map((_, i) => `#hs${i}:checked~.hs-stack .hs-${i}{opacity:1;visibility:visible}#hs${i}:checked~.hs-tabs label[for=hs${i}]{background:var(--ink);color:#fff}`).join("");
  return `<style>${rules}</style><div class="hs">
    ${items.map((_, i) => `<input type="radio" name="hs" id="hs${i}"${i ? "" : " checked"} class="vh">`).join("")}
    <div class="hs-stack">${imgs.join("")}</div>
    <div class="hs-tabs" role="presentation">${items.map((s, i) => `<label for="hs${i}">${esc(s.sub.split(/\s*·\s*/)[0] || s.alt)}</label>`).join("")}</div>
  </div>
  <script>(()=>{const r=[...document.querySelectorAll('.hs input[name=hs]')],h=document.querySelector('.hs');if(r.length<2||matchMedia('(prefers-reduced-motion: reduce)').matches)return;let seen=true,t=setInterval(()=>{if(!seen||document.hidden)return;const i=r.findIndex(x=>x.checked);r[(i+1)%r.length].checked=true},4000);new IntersectionObserver(e=>{seen=e[0].isIntersecting}).observe(h);h.addEventListener('pointerdown',()=>clearInterval(t),{once:true});h.addEventListener('keydown',()=>clearInterval(t),{once:true})})()</script>`;
}

async function home() {
  const rel = "";
  const heroItems = screens.filter((s) => /hero-/.test(s.src));
  const phones = [], cards = [];
  for (const s of screens.filter((s) => !/hero-/.test(s.src))) {
    const im = await image(s.src, s.alt, { sizes: "(max-width:700px) 62vw, 240px" });
    (im.ratio > 1.5 ? phones : cards).push({ ...s, im });
  }
  const chapterBlocks = []; for (const [i, c] of chapters.entries()) chapterBlocks.push(await chapterHtml(c, i, "th", rel));
  const id = (s) => s ? slug(s.title) : "";
  const nav = [[featSec?.title, "#" + id(featSec)], [screensSec?.title, "#" + id(screensSec)], [installSec?.title.replace(/\s*\(.*\)/, ""), "#" + id(installSec)], [faqSec?.title, "#" + id(faqSec)]].filter(([a]) => a);
  const body = `
<section class="hero">
  <div class="wrap hero-in">
    <div class="hero-text">
      <p class="kicker">${esc(nameEn || "")}${nameEn ? " · " : ""}v${esc(pkg.version)} · ${L.th.updated} ${fmtDate(head.date, "th")}</p>
      <h1>${phr(tagline)}</h1>
      <p class="lede">${esc(subline)}</p>
      <div class="actions">
        ${deployUrl ? `<a class="btn primary" href="${deployUrl}">Deploy to Cloudflare</a>` : ""}
        ${docFiles[0] ? `<a class="btn" href="docs/${docSlug(docFiles.find((f) => /deploy/i.test(f)) || docFiles[0])}/">${esc(docTitle(docFiles.find((f) => /deploy/i.test(f)) || docFiles[0]))}</a>` : ""}
      </div>
      ${techList("stack")}
    </div>
    <div class="hero-shot">${await heroSwitch(heroItems, "")}</div>
  </div>
</section>

${why ? `<section class="band" id="${id(why)}">
  <div class="wrap">
    <h2>${phr(why.title)}</h2>
    <div class="why">${highlights.map((h) => `<div><h3>${phr(h.title)}</h3><p>${tidy(rewriteLinks(h.html, rel), "th")}</p></div>`).join("")}</div>
  </div>
</section>` : ""}

${screensSec ? `<section id="${id(screensSec)}">
  <div class="wrap">
    <h2>${phr(screensSec.title)}</h2>
    <div class="phones">${phones.map((p) => `<figure>${p.im.tag("")}<figcaption><strong>${esc(p.title)}</strong>${esc(p.sub)}</figcaption></figure>`).join("")}</div>
    ${screensText ? `<div class="prose narrow">${mdToHtml(screensText, { from: rel })}</div>` : ""}
    <div class="cards">${cards.map((p) => `<figure>${p.im.tag("")}<figcaption>${esc(p.sub || p.title)}</figcaption></figure>`).join("")}</div>
  </div>
</section>` : ""}

${featSec ? `<section id="${id(featSec)}">
  <div class="wrap">
    <h2>${phr(featSec.title)}</h2>
    ${chapterBlocks.join("\n")}
  </div>
</section>` : ""}

${installSec ? `<section class="band" id="${id(installSec)}">
  <div class="wrap split">
    <h2>${phr(installSec.title)}</h2>
    <div class="prose">${mdToHtml(installSec.body, { from: rel })}</div>
  </div>
</section>` : ""}

${settingsSec ? `<section id="${id(settingsSec)}">
  <div class="wrap split">
    <h2>${phr(settingsSec.title)}</h2>
    <div class="prose">${mdToHtml(settingsSec.body, { from: rel })}</div>
  </div>
</section>` : ""}

${faqSec ? `<section class="band" id="${id(faqSec)}">
  <div class="wrap split">
    <h2>${phr(faqSec.title)}</h2>
    ${faqHtml(faqs, "th", rel)}
  </div>
</section>` : ""}

${archSec ? `<section id="${id(archSec)}">
  <div class="wrap split">
    <h2>${phr(archSec.title)}</h2>
    <div class="prose">${mdToHtml(archSec.body, { from: rel })}</div>
  </div>
</section>` : ""}
`;
  pages.push({ rel, date: fileDate("README.md") });
  return page({ lang: "th", rel, title: `${nameTh} — ${tagline}`, description: `${tagline} ${subline}`.slice(0, 300), body, nav,
    alternates: [["th", SITE], ["en", SITE + "en/"], ["x-default", SITE]], updated: fileDate("README.md"),
    jsonld: [app("th", chapters.flatMap((c) => boldTitles(c.body))), faqLd(faqs, "th"), { "@context": "https://schema.org", "@type": "WebSite", url: SITE, name: nameTh, inLanguage: "th" }].filter(Boolean) });
}

async function english() {
  const rel = "en/";
  const heroItems = screens.filter((s) => /hero-/.test(s.src));
  const phones = [];
  for (const s of screens.filter((s) => !/hero-/.test(s.src))) { const im = await image(s.src, s.alt, { sizes: "(max-width:700px) 62vw, 240px" }); if (im.ratio > 1.5) phones.push(im); }
  const blocks = []; for (const [i, c] of enChapters.entries()) blocks.push(await chapterHtml(c, i, "en", rel));
  const introFirst = enIntro.split("\n\n")[0] || "";
  const nav = enChapters.slice(0, 3).map((c) => [c.title, "#" + slug(c.title)]).concat(enFaqPart ? [[enFaqPart.title, "#faq"]] : []);
  const body = `
<section class="hero">
  <div class="wrap hero-in">
    <div class="hero-text">
      <p class="kicker">v${esc(pkg.version)} · ${L.en.updated} ${fmtDate(head.date, "en")}</p>
      <h1>${esc(strip(marked.parseInline((introFirst.match(/^\*\*(.+?)\*\*/) || [])[1] || nameEn || nameTh)))}</h1>
      <div class="lede">${mdToHtml(introFirst, { lang: "en", from: rel })}</div>
      <div class="actions">
        ${deployUrl ? `<a class="btn primary" href="${deployUrl}">Deploy to Cloudflare</a>` : ""}
        <a class="btn" href="${REPO_URL}">${ghIcon} GitHub</a>
      </div>
      ${techList("stack")}
    </div>
    <div class="hero-shot">${await heroSwitch(heroItems, "../")}</div>
  </div>
</section>
<section>
  <div class="wrap">
    <h2 class="vh">Features</h2>
    <div class="phones">${phones.map((im) => `<figure>${im.tag("../")}</figure>`).join("")}</div>
    ${blocks.join("\n")}
  </div>
</section>
${enFaqs.length ? `<section class="band" id="faq">
  <div class="wrap split">
    <h2>${phr(enFaqPart.title)}</h2>
    ${faqHtml(enFaqs, "en", rel)}
  </div>
</section>` : ""}
`;
  pages.push({ rel, date: fileDate("README.md") });
  return page({ lang: "en", rel, title: `${nameEn || nameTh} — ${strip(marked.parse(introFirst)).split(". ")[0].replace(/^.*? is an? /, "").slice(0, 80)}`, description: strip(marked.parse(introFirst)).slice(0, 300), body, nav,
    alternates: [["th", SITE], ["en", SITE + "en/"], ["x-default", SITE]], updated: fileDate("README.md"),
    jsonld: [app("en", enChapters.flatMap((c) => boldTitles(c.body))), faqLd(enFaqs, "en")].filter(Boolean) });
}

async function doc(f) {
  const rel = `docs/${docSlug(f)}/`;
  const md = read(f);
  const title = docTitle(f);
  const bodyMd = md.replace(/^# .+\n/, "");
  const toc = [];
  const html = mdToHtml(bodyMd, { from: rel, toc });
  const lead = strip(mdToHtml(bodyMd.split(/\n\s*\n/).find((b) => /^[^#>|`\-<]/.test(b.trim())) || "", { from: rel }));
  const updated = fileDate(f);
  const body = `
<div class="wrap doc">
  <aside class="doc-side">
    <nav aria-label="${L.th.docs}">
      <p class="side-h">${L.th.docs}</p>
      <ul>${docFiles.map((d) => `<li><a href="../${docSlug(d)}/"${d === f ? ' aria-current="page"' : ""}>${esc(docTitle(d))}</a></li>`).join("")}</ul>
      ${toc.length ? `<p class="side-h">${L.th.onThis}</p><ul class="toc">${toc.map((t) => `<li><a href="#${t.id}">${esc(t.text)}</a></li>`).join("")}</ul>` : ""}
    </nav>
  </aside>
  <article class="prose doc-body">
    <p class="crumbs"><a href="../../">${L.th.home}</a> / ${esc(title)}</p>
    <h1>${phr(title)}</h1>
    ${html}
    <p class="doc-meta">${L.th.updated} <time datetime="${updated}">${fmtDate(updated, "th")}</time> · <a href="${blob(f)}">${L.th.edit}</a></p>
  </article>
</div>`;
  pages.push({ rel, date: updated });
  return page({ lang: "th", rel, title: `${title} — ${nameTh}`, description: lead.slice(0, 300) || title, body, updated,
    nav: [[L.th.home, "../../"]], alternates: [["th", SITE + rel]],
    jsonld: [
      { "@context": "https://schema.org", "@type": "TechArticle", headline: title, description: lead.slice(0, 300), inLanguage: "th", dateModified: updated, url: SITE + rel, isPartOf: { "@id": appId }, author: { "@type": "Person", name: owner } },
      { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: nameTh, item: SITE }, { "@type": "ListItem", position: 2, name: title, item: SITE + rel }] },
    ] });
}

// ---------- write ----------
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const write = (rel, s) => { const p = path.join(OUT, rel); mkdirSync(path.dirname(p), { recursive: true }); writeFileSync(p, s); };
write("index.html", await home());
if (enSec) write("en/index.html", await english());
for (const f of docFiles) write(`docs/${docSlug(f)}/index.html`, await doc(f));
for (const f of ["icon.svg", "apple-touch-icon.png"]) if (existsSync(path.join(ROOT, "public", f))) copyFileSync(path.join(ROOT, "public", f), path.join(OUT, f));
if (banner) await sharp(path.join(ROOT, banner.replace(/\?.*$/, ""))).resize({ width: 1200, height: 630, fit: "contain", background: "#f6f5f1" }).flatten({ background: "#f6f5f1" }).jpeg({ quality: 82 }).toFile(path.join(OUT, "og.jpg"));
write("404.html", `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>404 · ${esc(nameTh)}</title><link rel="icon" type="image/svg+xml" href="${BASE}icon.svg"><style>${css}</style></head><body><main class="wrap notfound"><p class="kicker">404</p><h1>${esc(nameTh)}</h1><p><a class="btn primary" href="${BASE}">${L.th.home}</a> <a class="btn" href="${BASE}en/">English</a></p></main></body></html>\n`);
write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map((p) => `  <url><loc>${SITE}${p.rel}</loc><lastmod>${(p.date || head.date).slice(0, 10)}</lastmod></url>`).join("\n")}\n</urlset>\n`);
const enPlain = strip(marked.parse(enIntro.split("\n\n")[0] || ""));
write("llms.txt", `# ${h1}\n\n> ${enPlain || `${tagline} ${subline}`}\n\n${tagline}. ${subline}\n\n## Pages\n\n- [Home (Thai)](${SITE}): features, screenshots, install, settings, FAQ\n${enSec ? `- [Home (English)](${SITE}en/): English overview and FAQ\n` : ""}${docFiles.map((f) => `- [${docTitle(f)}](${SITE}docs/${docSlug(f)}/): ${f}`).join("\n")}\n\n## Source\n\n- [Repository](${REPO_URL})\n- [README.md](${blob("README.md")})\n${docFiles.map((f) => `- [${f}](${blob(f)})`).join("\n")}\n\n## Optional\n\n- [Full text of all docs](${SITE}llms-full.txt)\n`);
write("llms-full.txt", ["README.md", ...docFiles].map((f) => `<!-- ${f} (${REPO_URL}/blob/main/${f}) -->\n\n${read(f)}`).join("\n\n---\n\n"));
write(".nojekyll", "");
console.log(`built ${pages.length} pages → ${path.relative(ROOT, OUT)} (${SITE}, ${head.sha})`);
