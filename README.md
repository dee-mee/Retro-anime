# Otherworld Colony — Retro Anime Isekai

A landscape action RPG for Android in the style of an old-school (80s/90s) isekai anime:
cel-shaded, ink-outlined, with a faded film grade and episode title cards.

> Your whole class is summoned to another world — thirty heroes, as the prophecy foretold.
> You are the thirty-first. No blessing, no skills, thrown away in the Forbidden Forest...
> where a strange fruit is glowing on a crooked tree.

## Features

- **Open world** — walk anywhere: villages of timber-framed houses, dirt roads, farms with
  farmers working the fields, horses in paddocks and pulling carts, and forests to get lost in.
- **Over-the-shoulder camera** — follows you as you run, drag to look around, pinch to zoom.
- **Shooter-style touch controls** — joystick on the left; attack, spells, dash and potions on
  the right.
- **Evolution Fruits** — eat them to grow stronger; eat enough and your race evolves
  (Human → Evolved Human → Transcendent → Saint of the Forest → Demigod), announced by the
  【System】.
- **A companion beast** — feed a starving beast and it follows you; feed it more and it grows;
  feed it Evolution Fruit and it takes human form and joins your party.
- **Story** — a prologue in the Forbidden Forest, then five chapters and an epilogue, with
  your summoned classmates along the way.
- **Adventurers' Guild** — registration with the measuring crystal, guild card, ranks F → S.
- **Buildings you can walk into** — your home (stairs up to your bed), inns, and the guild hall.
- **Quests, bosses and dungeons**, partners who join your party, a base you upgrade, swords
  from the blacksmith, spells and staffs from the magic shop.
- **Ogres, slimes and worse** — slimes never enter villages; ogres lurk in the deep woods.
- **Saves on the phone**, with a backup code you can copy out and restore.

## Play it in a browser

```bash
npm install
npm run dev:isekai
```

Then open the address it prints. Keyboard: WASD move · J/Space attack · 1–4 spells ·
Shift dash · Q potion · E talk/enter.

## Build the Android app

The game is built into a single HTML file and wrapped in an Expo app (`mobile/`).

```bash
npm run build:isekai          # writes mobile/assets/game/game.html
cd mobile
npm install
EAS_NO_VCS=1 npx eas-cli build -p android --profile preview   # an installable APK
```

App icons are generated from the emblem in `src/isekai/logo.js`: `node tools/build-icons.mjs`.

## Where things are

| Path | What it is |
| --- | --- |
| `src/isekai/` | The game: story, quests, combat, fruits, villages, interiors, UI, anime look |
| `src/isekai/data.js` | Regions, villagers, quests, monsters, items — the place to add content |
| `src/isekai/realm.js` | The world builder: villages, roads, farms, forests, horses, portal |
| `src/isekai/interiors.js` | Home, inn and guild interiors |
| `src/isekai/anime.js` | Cel shading, ink outlines and the film grade |
| `mobile/` | The Android app (Expo) |

## Credits

- Built on the open-source 3D engine from **Bot Crossing** by Jarren Rocks (MIT licence —
  see `LICENSE`). The name "Bot Crossing" belongs to its author and is not used for this game.
- 3D models: **KayKit** packs by Kay Lousberg and the **Nature Kit** by Kenney, both CC0 —
  see `public/assets/CREDITS.md`.
- Engine: [three.js](https://threejs.org).
