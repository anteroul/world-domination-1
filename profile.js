(function () {
  // Player card (assigned name + country flag) and the hiscore widget.
  // Name and country live in localStorage only; the SWF's own submit popup
  // still asks for a name when a score is posted.
  const HISCORE_HOST = window.WD1_HISCORE_HOST || location.origin + "/";
  const NAME_MAX = 20; // matches server.js
  const BOARD_LIMIT = 10;

  const flagEl = document.getElementById("player-flag");
  const countryMenu = document.getElementById("country-menu");
  const countrySearch = document.getElementById("country-search");
  const countryListEl = document.getElementById("country-list");
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
    const label = country ? countryName(country) : null;
    flagEl.textContent = country ? flagEmoji(country) : "\u{1F310}";
    flagEl.setAttribute("aria-label", "Country: " + (label || "unknown") + ". Change country");
    flagEl.title = (label || "Unknown country") + " (click to change)";
  }

  // ------------------------------------------------------- country picker

  // ISO 3166-1 alpha-2 codes, plus XK (Kosovo), which has a flag emoji.
  const COUNTRY_CODES = (
    "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ " +
    "BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM " +
    "DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS " +
    "GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN " +
    "KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ " +
    "MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM " +
    "PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV " +
    "SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI " +
    "VN VU WF WS XK YE YT ZA ZM ZW"
  ).split(" ");

  let countries = null; // [{ cc, label }] sorted by label, built on first open
  let shown = [];
  let activeIdx = -1;

  function allCountries() {
    if (!countries) {
      countries = COUNTRY_CODES
        .map(function (cc) { return { cc: cc, label: countryName(cc) }; })
        .sort(function (a, b) { return a.label.localeCompare(b.label); });
    }
    return countries;
  }

  function renderMenu() {
    const q = countrySearch.value.trim().toLowerCase();
    shown = allCountries().filter(function (c) {
      return !q || c.label.toLowerCase().includes(q) || c.cc.toLowerCase() === q;
    });
    countryListEl.replaceChildren();
    if (shown.length === 0) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = "No matches";
      countryListEl.appendChild(li);
    }
    shown.forEach(function (c) {
      const li = document.createElement("li");
      li.id = "country-opt-" + c.cc;
      li.dataset.cc = c.cc;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", String(c.cc === country));
      const flag = document.createElement("span");
      flag.className = "opt-flag";
      flag.textContent = flagEmoji(c.cc);
      li.append(flag, document.createTextNode(c.label));
      countryListEl.appendChild(li);
    });
    const current = q ? -1 : shown.findIndex(function (c) { return c.cc === country; });
    setActive(current >= 0 ? current : 0);
  }

  function setActive(i, scroll) {
    if (shown.length === 0) {
      activeIdx = -1;
      countrySearch.removeAttribute("aria-activedescendant");
      return;
    }
    activeIdx = Math.max(0, Math.min(shown.length - 1, i));
    const prev = countryListEl.querySelector("li.active");
    if (prev) prev.classList.remove("active");
    const li = countryListEl.children[activeIdx];
    li.classList.add("active");
    if (scroll !== false) li.scrollIntoView({ block: "nearest" });
    countrySearch.setAttribute("aria-activedescendant", li.id);
  }

  function openMenu() {
    countryMenu.hidden = false;
    flagEl.setAttribute("aria-expanded", "true");
    countrySearch.value = "";
    renderMenu();
    countrySearch.focus();
  }

  function closeMenu(refocus) {
    if (countryMenu.hidden) return;
    countryMenu.hidden = true;
    flagEl.setAttribute("aria-expanded", "false");
    if (refocus) flagEl.focus();
  }

  function chooseCountry(cc) {
    country = cc;
    save("wd1.country", country);
    renderCard();
    closeMenu(true);
  }

  flagEl.addEventListener("click", function () {
    if (countryMenu.hidden) openMenu();
    else closeMenu(false);
  });

  countrySearch.addEventListener("input", renderMenu);

  countrySearch.addEventListener("keydown", function (e) {
    const page = 8;
    switch (e.key) {
      case "ArrowDown": setActive(activeIdx + 1); break;
      case "ArrowUp": setActive(activeIdx - 1); break;
      case "PageDown": setActive(activeIdx + page); break;
      case "PageUp": setActive(activeIdx - page); break;
      case "Enter": if (activeIdx >= 0) chooseCountry(shown[activeIdx].cc); break;
      case "Escape": closeMenu(true); break;
      case "Tab": closeMenu(false); return;
      default: return;
    }
    e.preventDefault();
  });

  // Keep focus in the search box while clicking the list.
  countryListEl.addEventListener("mousedown", function (e) { e.preventDefault(); });
  // Hover moves the same highlight the arrow keys use. mousemove rather than
  // mouseover, so keyboard scrolling under a resting cursor doesn't steal it.
  countryListEl.addEventListener("mousemove", function (e) {
    const li = e.target.closest("li[data-cc]");
    if (!li) return;
    const i = Array.prototype.indexOf.call(countryListEl.children, li);
    if (i !== activeIdx) setActive(i, false);
  });
  countryListEl.addEventListener("click", function (e) {
    const li = e.target.closest("li[data-cc]");
    if (li) chooseCountry(li.dataset.cc);
  });

  document.addEventListener("pointerdown", function (e) {
    if (!countryMenu.contains(e.target) && !flagEl.contains(e.target)) closeMenu(false);
  });

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
