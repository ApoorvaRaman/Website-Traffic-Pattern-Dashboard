# TRAFFIC/PATTERN.DASH — Website Traffic Pattern Dashboard

A static, 100% client-side dashboard that analyzes Apache/NASA-format web
server access logs to find **peak traffic hours**, the **busiest day of the
week**, and a full **hour × weekday heatmap** — with no backend server, no
database, and no recurring cost.

**Live demo (sample data):** hosted on GitHub Pages / Cloudflare Pages — see
[Deploying](#deploying-100-free-forever) below.

![status](https://img.shields.io/badge/backend-none-brightgreen) ![cost](https://img.shields.io/badge/hosting-%240%2Fmonth-brightgreen)

---

## Why there's no backend

Log analysis for this use case (bucket timestamps by hour/weekday) doesn't
need a server:

- **Batch mode** — a small Python script (`scripts/parse_logs.py`) reads a
  raw access log once and writes a compact `data/data.json` that the page
  fetches. This is the recommended path for the full NASA-HTTP (1995) or
  Kaggle Apache Logs datasets, which are tens to hundreds of MB — you don't
  want to ship or re-parse that in a browser on every visit.
- **Interactive mode** — the dashboard also has an **Upload log file**
  button that parses a log **entirely in the visitor's browser** with the
  same regex logic (see `app.js`), so anyone can drop in their own log and
  see results instantly. Nothing is uploaded to any server.

This means the whole thing is two static files (`index.html` + `app.js` +
`style.css`) plus a JSON file, which is exactly what free static hosts like
GitHub Pages and Cloudflare Pages are built for — no server tier, no
database tier, nothing that can ever start billing you or expire.

## What it shows

- **KPI row** — peak hour, peak day, total requests, days covered
- **Bar chart** — requests per hour of day (0–23)
- **Bar chart** — requests per day of week (Mon–Sun)
- **Heatmap** — 7×24 grid (weekday × hour) with hover tooltips
- **Top requested paths** and **HTTP status code breakdown**

## Project structure

```
.
├── index.html              # Dashboard markup
├── style.css                # Design system / styling
├── app.js                   # Fetches data.json, renders charts, parses uploads
├── data/
│   ├── sample_access.log    # Synthetic demo log (NASA-log-style, 21 days)
│   └── data.json             # Precomputed output the dashboard loads by default
├── scripts/
│   ├── parse_logs.py         # Batch parser: raw log -> data.json
│   └── generate_sample_log.py # Regenerates the synthetic demo log (optional)
└── README.md
```

## Using it with the real datasets

### NASA-HTTP (1995) access logs
1. Download `NASA_access_log_Jul95.gz` / `NASA_access_log_Aug95.gz` from the
   NASA-HTTP archive (search "NASA HTTP web server logs 1995" — mirrored on
   several university/research archive sites since the original ita.ee.lbl.gov
   host is retired).
2. Decompress: `gunzip NASA_access_log_Jul95.gz`
3. Parse it:
   ```bash
   python3 scripts/parse_logs.py NASA_access_log_Jul95 -o data/data.json --source "NASA-HTTP July 1995"
   ```
4. Commit the updated `data/data.json` and push — the live site updates on
   next deploy. Or just use the in-browser **Upload log file** button and
   point it at the raw log directly (works for files up to a few hundred MB
   depending on the visitor's device memory).

### Kaggle — Apache Web Server Logs
1. Download the CSV/log file from Kaggle (requires a free Kaggle account to
   download; the dataset itself is free/open).
2. If it's a `.log`/`.txt` file in Combined Log Format, parse it the same way:
   ```bash
   python3 scripts/parse_logs.py apache_logs.txt -o data/data.json --source "Kaggle Apache Logs"
   ```
3. If it's a `.csv`, either re-export the relevant column as raw log lines,
   or adapt `parse_log_file()` in `scripts/parse_logs.py` — it's a ~40-line
   function using Python's `csv` module instead of the regex, same output
   shape.

### Your own server logs
Any log in NCSA Common or Combined Log Format works out of the box:
```
host ident authuser [date] "request" status bytes ["referrer" "agent"]
```
Just run `parse_logs.py` on it, or upload it directly in the browser.

## Regenerating the bundled demo data

```bash
python3 scripts/generate_sample_log.py        # writes data/sample_access.log
python3 scripts/parse_logs.py data/sample_access.log -o data/data.json --source "Sample demo log"
```

## Running locally

No build step. Any static file server works:
```bash
python3 -m http.server 8000
# open http://localhost:8000
```
(Opening `index.html` directly via `file://` also mostly works, but some
browsers block `fetch()` of local JSON over `file://` — a local server avoids
that.)

## Deploying — 100% free, forever

Both options below have **no paid tier requirement, no trial period, and no
traffic limits that would ever force an upgrade** for a project this size
(a few static files + JSON, no build step, no server).

### Option A — GitHub Pages
1. Push this folder to a GitHub repository.
2. Repo → **Settings → Pages** → Source: **Deploy from a branch** → pick
   `main` and `/ (root)`.
3. Your site is live at `https://<username>.github.io/<repo>/` within a
   minute or two, free permanently, no credit card, no limits for a static
   site of this size.

### Option B — Cloudflare Pages
1. Push this folder to a GitHub (or GitLab) repository.
2. [pages.cloudflare.com](https://pages.cloudflare.com) → **Create a
   project** → connect the repo.
3. Build settings: **Framework preset: None**, **Build command: (empty)**,
   **Build output directory: `/`**.
4. Deploy — you get a free `*.pages.dev` URL (and can attach a custom domain
   for free) on Cloudflare's permanently-free plan, with no bandwidth
   billing surprise for a static site.

Either works standalone; you don't need both. Cloudflare Pages is a good
second option if you want a custom domain with free SSL and very fast global
CDN edge caching, or as a mirror if you want two independent free hosts.

## Tech stack (all free / open source)

- Vanilla HTML/CSS/JS — no framework, no build step, nothing to go stale
- [Chart.js](https://www.chartjs.org/) (MIT) via CDN — bar charts
- Custom CSS-grid heatmap — no extra dependency
- Python 3 standard library only for the batch parser (`re`, `json`,
  `collections`, `argparse`, `datetime`) — no pandas/numpy required
- Fonts: Space Grotesk + IBM Plex Mono (Google Fonts, open license)

## License

MIT — do whatever you like with it.
