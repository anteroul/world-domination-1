# World Domination 1 (2003)

## 🗺️ Conquering the Globe
World Domination is a classic, turn-based Flash strategy game where your only goal is total global conquest. You choose one of five nations and deploy military, economic, and covert operations to wipe your four rivals off the map.
## 🕹️ Strategic Gameplay

* Turn-Based Management: Balance your budget each round to fund military campaigns, build resource factories, or initiate brief peace treaties.
* Aggressive Warfare: Launch massive ground invasions, deploy devastating air strikes, or drop nuclear bombs to obliterate enemy defenses.
* Covert Subversion: Send spies to steal enemy intelligence or launch propaganda campaigns to win over foreign citizens to your side.
* Political Satire: Play alongside stylized caricatures of actual mid-2000s world leaders, adding a layer of dark political humor to the warfare.

## ▶️ Playing in the browser
The game runs on [Ruffle](https://ruffle.rs), a Flash Player emulator. Browsers block loading the `.swf` from `file://`, so serve the folder over HTTP:

```sh
nix run              # or, with Node.js installed: npm start
```

Then open <http://localhost:8080>. Use **Play in fullscreen** (or the **Fullscreen** button while playing) to fill the screen. The **Scale** menu sizes the game up to 3× its native 700×450; because Flash graphics are vectors, Ruffle redraws them at the larger size instead of stretching pixels.

## 🌐 GitHub Pages
`npm run build` copies the site into `dist/`. Pushing to `main` runs `.github/workflows/pages.yml`, which builds and deploys it. One-time setup: in the repository's **Settings → Pages**, set **Source** to **GitHub Actions**.
