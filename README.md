# 🏙️ Metropolis — City Management Game

A tiny browser city-builder: zone roads and buildings, keep the lights on, balance the budget, and grow an outpost into a megalopolis.

**No installs, no build step** — it's pure HTML/CSS/JS. Open `index.html` and play.

▶ **Play it online:** https://hudson191-max.github.io/city-management-game/

## How to play

1. **Build roads** from the toolbar, then place buildings next to them.
2. **Houses / Apartments** attract residents (they need power + road).
3. **Shops / Offices / Factories** create jobs — residents need jobs to stay happy.
4. **Power plants / wind turbines** supply electricity. If demand exceeds supply → brownout (buildings dim, happiness drops).
5. **Parks, schools, hospitals, police and fire stations** raise happiness for homes nearby. Factories and power plants *pollute* nearby homes — keep them away from residential areas.
6. Each **month** (a few seconds) you collect taxes and pay upkeep. Watch the stats bar at the top.
7. Your city autosaves in your browser. 💾

### Ranks

| Residents | Rank |
|---|---|
| 0 | Outpost |
| 50 | Village |
| 200 | Town |
| 500 | City |
| 1,200 | Metropolis |
| 2,500 | Megalopolis |

### Buildings

| Building | Cost | Upkeep/mo | Effect |
|---|---|---|---|
| Road | $10 | — | Required next to almost every building |
| House | $120 | $1 | Houses 10 residents · 2 power |
| Apartment | $500 | $4 | Houses 50 residents · 8 power |
| Shop | $250 | $2 | 12 jobs · 4 power |
| Office | $700 | $6 | 35 jobs · 8 power |
| Factory | $400 | $3 | 30 jobs · 10 power · pollutes nearby |
| Power plant | $1,200 | $18 | +120 power · pollutes nearby |
| Wind turbine | $700 | $4 | +25 power · clean · no road needed |
| Park | $180 | $2 | +happiness nearby · no road needed |
| School | $600 | $8 | +happiness nearby |
| Hospital | $900 | $12 | +happiness nearby |
| Police | $500 | $7 | +safety nearby |
| Fire dept. | $500 | $7 | +safety nearby |
| Bulldoze | $5 | — | Demolish a tile |

## Run locally

Just open `index.html` in a browser — or:

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

## Tech

- Vanilla JavaScript, CSS Grid, `localStorage` saves. No frameworks, no dependencies, ~700 lines total.

## License

[MIT](LICENSE) © Dries (hudson191-max)
