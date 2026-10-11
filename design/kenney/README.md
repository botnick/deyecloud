# Home hero house (Kenney City Kit — Suburban, CC0)

`public/hero/kenney-day.webp` / `kenney-night.webp` are offline renders of Kenney's
**City Kit (Suburban) 2.0** (https://kenney.nl/assets/city-kit-suburban, CC0 1.0 — no
attribution required, credited anyway). Model `building-type-h` with texture
`variation-c`, plus `tree-large`, `tree-small`, `planter`, on a box ground tile.

Re-render: unzip the kit to `~/.cache/kenney/suburban`, `npm i three@0.170.0` in
`~/.cache/kenney/render`, copy `render.html` + `shoot.cjs` there, serve `~/.cache/kenney`
on 127.0.0.1:8766, then run `shoot.cjs` with the layout used (yaw 135, sunyaw 160,
zoom 1.18, gw 2.4, gd 2.0; `mode=night` adds window emission). Crop + save as WebP.
