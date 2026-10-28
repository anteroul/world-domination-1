#!/usr/bin/env node
// Static file server for the Ruffle launcher + hiscore backend. No dependencies.
// Requires Node >= 22.13 (built-in node:sqlite without a flag).
// Usage: node server.js [port]
// Env:   PORT, HOST, WD1_ROOT (static dir), WD1_DB (sqlite file),
//        WD1_MAX_SCORE (plausibility cap), TRUST_PROXY=1 (behind nginx/Caddy)

const http = require("http");
const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const ROOT = path.resolve(process.env.WD1_ROOT || __dirname);
const PORT = Number(process.argv[2] || process.env.PORT || 8080);
const HOST = process.env.HOST || "127.0.0.1";
const DB_PATH = path.resolve(process.env.WD1_DB || path.join(__dirname, "data", "scores.sqlite"));
const TRUST_PROXY = process.env.TRUST_PROXY === "1";

const GAME_UID = "ucXgOurh0w5JzvHK";       // the uid baked into the SWF's getURL
const MAX_SCORE = Number(process.env.WD1_MAX_SCORE || 10_000_000);
const NAME_MAX = 20;                        // in characters (code points)
const SUBMIT_COOLDOWN_MS = 30_000;          // one submission per IP per 30 s
const BOARD_SIZE = 100;

// Only these extensions are served statically. Anything else (the database,
// its -wal/-shm files, dotfiles, backups) is a 404 even if it sits under ROOT.
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".swf": "application/x-shockwave-flash",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
};

// ---------------------------------------------------------------- database

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS scores (
    id      INTEGER PRIMARY KEY,
    name    TEXT    NOT NULL,
    score   INTEGER NOT NULL,
    created INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS scores_by_score ON scores (score DESC, created ASC);
`);

const insertScore = db.prepare("INSERT INTO scores (name, score) VALUES (?, ?)");
const topScores = db.prepare(
  "SELECT id, name, score, created FROM scores ORDER BY score DESC, created ASC LIMIT ?"
);
const rankOf = db.prepare(
  "SELECT 1 + COUNT(*) AS rank FROM scores WHERE score > ? OR (score = ? AND id < ?)"
);

// ----------------------------------------------------------------- helpers

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// _level0.points is an AS2 Number; accept "123" or "123.0", floor it, cap it.
function parseScore(v) {
  if (typeof v !== "string" || !/^\d{1,10}(\.\d+)?$/.test(v)) return null;
  const n = Math.floor(Number(v));
  return Number.isSafeInteger(n) && n <= MAX_SCORE ? n : null;
}

function parseName(v) {
  if (typeof v !== "string") return null;
  const name = v.replace(/[\p{Cc}\p{Cf}]/gu, "").replace(/\s+/g, " ").trim();
  const chars = [...name];
  if (chars.length === 0) return null;
  return chars.slice(0, NAME_MAX).join("");
}

function clientIp(req) {
  if (TRUST_PROXY) {
    // With a single reverse proxy, the last entry is the one it appended.
    const xff = String(req.headers["x-forwarded-for"] || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (xff.length) return xff[xff.length - 1];
  }
  return req.socket.remoteAddress || "unknown";
}

const lastSubmit = new Map();
setInterval(() => {
  const cutoff = Date.now() - SUBMIT_COOLDOWN_MS;
  for (const [ip, t] of lastSubmit) if (t < cutoff) lastSubmit.delete(ip);
}, 60_000).unref();

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error("Body too large"), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function page(res, status, title, body) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy":
      "default-src 'none'; style-src 'self'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
  });
  res.end(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)} · World Domination</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <main class="hiscore">
${body}
  </main>
</body>
</html>`);
}

function json(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*", // read by index.html on GitHub Pages
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}

function leaderboardHtml(rows, highlightId) {
  if (rows.length === 0) return "<p>No scores yet.</p>";
  const items = rows
    .map((r) => `<li${r.id === highlightId ? ' class="you"' : ""}><span class="name">${esc(r.name)}</span> <span class="score">${r.score}</span></li>`)
    .join("\n");
  return `<ol class="board">\n${items}\n</ol>`;
}

// ------------------------------------------------------------------ routes

// GET /popup_highscore.phtml?uid=...&score=...  (opened by the SWF's getURL)
function handlePopup(req, res, url) {
  const score = parseScore(url.searchParams.get("score"));
  if (url.searchParams.get("uid") !== GAME_UID || score === null) {
    return page(res, 400, "Invalid score",
      `<h1>Invalid score</h1>\n<p><a href="/highscores">View hiscores</a></p>`);
  }
  page(res, 200, "Submit score", `<h1>Your score: ${score}</h1>
<form method="post" action="/submit-score">
  <input type="hidden" name="score" value="${score}">
  <label>Name <input name="name" maxlength="${NAME_MAX}" required autofocus autocomplete="nickname"></label>
  <button type="submit" class="primary">Submit</button>
</form>
<p><a href="/highscores">View hiscores</a></p>`);
}

// POST /submit-score  (application/x-www-form-urlencoded: name, score)
async function handleSubmit(req, res) {
  const ctype = String(req.headers["content-type"] || "");
  if (!ctype.startsWith("application/x-www-form-urlencoded")) {
    return page(res, 415, "Unsupported", "<h1>Unsupported request</h1>");
  }
  const form = new URLSearchParams(await readBody(req, 2048));
  const name = parseName(form.get("name"));
  const score = parseScore(form.get("score"));
  if (name === null || score === null) {
    return page(res, 400, "Invalid submission",
      `<h1>Invalid submission</h1>\n<p><a href="/highscores">View hiscores</a></p>`);
  }

  const ip = clientIp(req);
  const now = Date.now();
  if (now - (lastSubmit.get(ip) || 0) < SUBMIT_COOLDOWN_MS) {
    return page(res, 429, "Slow down",
      `<h1>Slow down</h1>\n<p>Please wait a moment before submitting again.</p>\n<p><a href="/highscores">View hiscores</a></p>`);
  }
  lastSubmit.set(ip, now);

  const { lastInsertRowid } = insertScore.run(name, score);
  res.writeHead(303, { Location: `/highscores?you=${lastInsertRowid}` }).end();
}

// GET /highscores  (HTML leaderboard)
// Also served at /eshop/worlddomination/highscores.php, the path the SWF's
// main-menu button opens (after Ruffle's urlRewriteRules swap the host).
function handleBoard(req, res, url) {
  const you = Number(url.searchParams.get("you")) || 0;
  const rows = topScores.all(BOARD_SIZE);
  let note = "";
  if (you) {
    const mine = db.prepare("SELECT id, score FROM scores WHERE id = ?").get(you);
    if (mine) {
      const { rank } = rankOf.get(mine.score, mine.score, mine.id);
      note = `<p class="note">Your score placed <strong>#${rank}</strong>.</p>`;
    }
  }
  page(res, 200, "Hiscores", `<h1>Hiscores</h1>
${note}
${leaderboardHtml(rows, you)}
<p><a href="/">Back to the game</a></p>`);
}

// GET /api/highscores?limit=10  (JSON, for showing a board on index.html)
function handleApi(req, res, url) {
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 10, 1), BOARD_SIZE);
  json(res, 200, topScores.all(limit).map(({ name, score, created }) => ({ name, score, created })));
}

function serveStatic(req, res, url) {
  let urlPath;
  try {
    urlPath = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400).end("Bad request");
    return;
  }
  if (urlPath.endsWith("/")) urlPath += "index.html";

  const file = path.join(ROOT, path.normalize(urlPath));
  const type = TYPES[path.extname(file).toLowerCase()];
  if (!file.startsWith(ROOT + path.sep) || !type) {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
    return;
  }

  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": type, "Content-Length": stat.size });
    if (req.method === "HEAD") res.end();
    else fs.createReadStream(file).pipe(res);
  });
}

// ------------------------------------------------------------------ server

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, "http://localhost");
  } catch {
    res.writeHead(400).end("Bad request");
    return;
  }
  const isGet = req.method === "GET" || req.method === "HEAD";

  try {
    switch (url.pathname) {
      case "/popup_highscore.phtml":
        return isGet ? handlePopup(req, res, url) : res.writeHead(405, { Allow: "GET, HEAD" }).end();
      case "/submit-score":
        return req.method === "POST" ? await handleSubmit(req, res) : res.writeHead(405, { Allow: "POST" }).end();
      case "/highscores":
      case "/eshop/worlddomination/highscores.php": // the SWF's "Hiscores" menu button
        return isGet ? handleBoard(req, res, url) : res.writeHead(405, { Allow: "GET, HEAD" }).end();
      case "/api/highscores":
        return isGet ? handleApi(req, res, url) : res.writeHead(405, { Allow: "GET, HEAD" }).end();
      default:
        return isGet ? serveStatic(req, res, url) : res.writeHead(405, { Allow: "GET, HEAD" }).end();
    }
  } catch (err) {
    const status = err.status || 500;
    if (status === 500) console.error(err);
    if (!res.headersSent) res.writeHead(status, { "Content-Type": "text/plain" });
    res.end(status === 413 ? "Payload too large" : "Internal error");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`World Domination running at http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}/`);
  console.log(`Hiscores stored in ${DB_PATH}`);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
