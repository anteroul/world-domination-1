(function () {
  // Player card (assigned name + country flag) and the hiscore widget.
  // Name and country live in localStorage only; the SWF's own submit popup
  // still asks for a name when a score is posted.
  const HISCORE_HOST = window.WD1_HISCORE_HOST || location.origin + "/";
  const NAME_MAX = 20; // matches server.js
  const BOARD_LIMIT = 10;

  const flagEl = document.getElementById("player-flag");
  const nameEl = document.getElementById("player-name");
  const btnRename = document.getElementById("btn-rename");
  const list = document.getElementById("hiscores-list");
  const msg = document.getElementById("hiscores-msg");
  const btnRefresh = document.getElementById("btn-hiscores-refresh");
  const more = document.getElementById("hiscores-more");

  function load(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* storage unavailable */ }
  }

  // ------------------------------------------------------------ username

  const RANKS = ["General", "Admiral", "Marshal", "Colonel", "Major", "Captain", "Consul", "Premier"];
  const NOUNS = ["Wolf", "Bear", "Eagle", "Falcon", "Viper", "Lion", "Raven", "Hawk", "Tiger", "Shark"];

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function assignName() {
    const n = Math.floor(Math.random() * 900) + 100;
    return pick(RANKS) + pick(NOUNS) + n; // at most 18 chars
  }

  function cleanName(v) {
    const name = String(v || "").replace(/[\p{Cc}\p{Cf}]/gu, "").replace(/\s+/g, " ").trim();
    return [...name].slice(0, NAME_MAX).join("");
  }

  let username = cleanName(load("wd1.username"));
  if (!username) {
    username = assignName();
    save("wd1.username", username);
  }

  // ------------------------------------------------------------- country

  // Best guess from the browser's locale region (e.g. "fi-FI" -> "FI").
  function detectCountry() {
    const tags = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language])
      .concat(Intl.DateTimeFormat().resolvedOptions().locale);
    for (const tag of tags) {
      if (!tag) continue;
      try {
        const region = new Intl.Locale(tag).maximize().region;
        if (region && /^[A-Z]{2}$/.test(region)) return region;
      } catch (e) { /* malformed tag */ }
    }
    return null;
  }

  function flagEmoji(cc) {
    return String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
  }

  function countryName(cc) {
    try { return new Intl.DisplayNames([navigator.language || "en"], { type: "region" }).of(cc); } catch (e) { return cc; }
  }

  let country = load("wd1.country");
  if (!country || !/^[A-Z]{2}$/.test(country)) {
    country = detectCountry();
    if (country) save("wd1.country", country);
  }

  function renderCard() {
    nameEl.textContent = username;
    if (country) {
      const label = countryName(country);
      flagEl.textContent = flagEmoji(country);
      flagEl.setAttribute("aria-label", label);
      flagEl.title = label;
    }
  }

  btnRename.addEventListener("click", function () {
    const next = cleanName(window.prompt("Player name (max " + NAME_MAX + " characters):", username));
    if (!next) return;
    username = next;
    save("wd1.username", username);
    renderCard();
    renderBoard(lastRows);
  });

  // ------------------------------------------------------------ hiscores

  let lastRows = null;

  function renderBoard(rows) {
    list.replaceChildren();
    if (!rows) return;
    if (rows.length === 0) {
      msg.textContent = "No scores yet. Be the first!";
      msg.hidden = false;
      return;
    }
    msg.hidden = true;
    rows.forEach(function (r) {
      const li = document.createElement("li");
      if (r.name === username) li.className = "you";
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = r.name;
      if (r.created) name.title = new Date(r.created * 1000).toLocaleDateString();
      const score = document.createElement("span");
      score.className = "score";
      score.textContent = Number(r.score).toLocaleString();
      li.append(name, score);
      list.appendChild(li);
    });
  }

  function fetchBoard() {
    msg.textContent = "Loading…";
    msg.hidden = false;
    btnRefresh.disabled = true;
    fetch(HISCORE_HOST + "api/highscores?limit=" + BOARD_LIMIT, { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (rows) {
        lastRows = Array.isArray(rows) ? rows : [];
        renderBoard(lastRows);
      })
      .catch(function () {
        lastRows = null;
        renderBoard(null);
        msg.textContent = "Hiscores are unavailable right now.";
        msg.hidden = false;
      })
      .finally(function () { btnRefresh.disabled = false; });
  }

  more.href = HISCORE_HOST + "highscores";
  btnRefresh.addEventListener("click", fetchBoard);
  // Pick up new entries when the player returns from the submit popup.
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") fetchBoard();
  });

  renderCard();
  fetchBoard();
})();
