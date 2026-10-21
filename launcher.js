(function () {
  const SWF_URL = "WorldDomination1.swf";
  const BASE_W = 700;
  const BASE_H = 450;

  const wrap = document.getElementById("stage-wrap");
  const stage = document.getElementById("stage");
  const splash = document.getElementById("splash");
  const status = document.getElementById("status");
  const scaleSel = document.getElementById("scale");
  const qualitySel = document.getElementById("quality");
  const btnPlay = document.getElementById("btn-play");
  const btnPlayFs = document.getElementById("btn-play-fs");
  const btnFs = document.getElementById("btn-fs");
  const btnFsExit = document.getElementById("fs-exit");

  let player = null;

  function load(key, fallback) {
    try { return localStorage.getItem(key) || fallback; } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* storage unavailable */ }
  }

  scaleSel.value = load("wd1.scale", "fit");
  qualitySel.value = load("wd1.quality", "best");

  function isFullscreen() {
    return document.fullscreenElement === wrap;
  }

  // Size the player in CSS pixels. Ruffle renders vector content at
  // CSS size x devicePixelRatio, so a bigger box means a higher render resolution.
  function layout() {
    let w, h;
    if (isFullscreen()) {
      w = window.innerWidth;
      h = window.innerHeight;
    } else if (scaleSel.value === "fit") {
      const cs = getComputedStyle(wrap);
      const availW = wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const availH = wrap.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const s = Math.max(0.25, Math.min(availW / BASE_W, availH / BASE_H));
      w = Math.floor(BASE_W * s);
      h = Math.floor(BASE_H * s);
    } else {
      const s = parseFloat(scaleSel.value);
      w = BASE_W * s;
      h = BASE_H * s;
    }
    stage.style.setProperty("--stage-w", w);
    stage.style.setProperty("--stage-h", h);
    updateStatus();
  }

  function updateStatus() {
    if (!player) {
      status.textContent = "Not running";
      return;
    }
    const rect = stage.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const fitW = Math.min(rect.width, rect.height * BASE_W / BASE_H);
    const fitH = fitW * BASE_H / BASE_W;
    const rw = Math.round(fitW * dpr);
    const rh = Math.round(fitH * dpr);
    const factor = (rw / BASE_W).toFixed(2);
    status.textContent =
      "Rendering at " + rw + "×" + rh + " (" + factor + "× native 700×450)" +
      (isFullscreen() ? " · fullscreen" : "");
  }

  function createPlayer() {
    if (player) return player;
    const ruffle = window.RufflePlayer && window.RufflePlayer.newest();
    if (!ruffle) {
      status.textContent = "Could not load Ruffle. Check your internet connection and reload.";
      return null;
    }
    player = ruffle.createPlayer();
    stage.appendChild(player);
    const api = typeof player.ruffle === "function" ? player.ruffle() : player;
    api.load({
      url: SWF_URL,
      autoplay: "on",
      unmuteOverlay: "hidden",
      letterbox: "on",
      scale: "showAll",
      forceScale: true,
      quality: qualitySel.value,
      backgroundColor: "#000000",
      splashScreen: true,
      allowFullscreen: true,
      contextMenu: "on",
    }).catch(function (err) {
      status.textContent = "Failed to load " + SWF_URL + ": " + err +
        ". If you opened this file directly, serve the folder over HTTP instead (see README).";
    });
    splash.hidden = true;
    btnPlay.disabled = true;
    btnPlay.textContent = "Running";
    btnFs.disabled = false;
    layout();
    player.focus();
    return player;
  }

  function enterFullscreen() {
    if (wrap.requestFullscreen) {
      return wrap.requestFullscreen({ navigationUI: "hide" }).catch(function () {});
    }
    return Promise.resolve();
  }

  function exitFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
  }

  function launch(fullscreen) {
    // requestFullscreen must run synchronously inside the click handler.
    if (fullscreen) enterFullscreen();
    createPlayer();
  }

  btnPlay.addEventListener("click", function () { launch(false); });
  btnPlayFs.addEventListener("click", function () { launch(true); });
  splash.querySelectorAll("[data-launch]").forEach(function (b) {
    b.addEventListener("click", function () { launch(b.dataset.launch === "fullscreen"); });
  });

  btnFs.addEventListener("click", function () {
    if (isFullscreen()) exitFullscreen(); else enterFullscreen();
  });
  btnFsExit.addEventListener("click", exitFullscreen);

  document.addEventListener("fullscreenchange", function () {
    btnFs.textContent = isFullscreen() ? "Exit fullscreen" : "Fullscreen";
    layout();
    if (player) player.focus();
  });

  scaleSel.addEventListener("change", function () {
    save("wd1.scale", scaleSel.value);
    layout();
  });

  qualitySel.addEventListener("change", function () {
    save("wd1.quality", qualitySel.value);
    if (player) {
      status.textContent = "Quality changes apply the next time the game is launched.";
    }
  });

  window.addEventListener("resize", layout);
  if (window.matchMedia) {
    // Re-report when the window moves to a display with a different pixel ratio.
    const watchDpr = function () {
      window.matchMedia("(resolution: " + window.devicePixelRatio + "dppx)")
        .addEventListener("change", function () { updateStatus(); watchDpr(); }, { once: true });
    };
    watchDpr();
  }

  layout();
})();
