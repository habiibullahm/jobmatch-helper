# JobMatch Helper (`@jobmatch_tools_bot`)

Telegram bot for jobseekers: upload a CV (or search by keyword), get ranked matches from an **Indonesia job list** plus **Adzuna** (Singapore/global), and opt in to alerts.

## Features

- `/match` — preferences optional; **upload a PDF on the first step**
- Returning users: **Pakai profil** or **Update CV**
- `/search` — title/keywords; Indo cities filter the local catalog only
- `/alerts` — instant strong matches + daily digest (09:00 Asia/Jakarta)
- `/profile` — saved skill keywords (PDF is never stored)

## Setup

```bash
npm install
cp .env.example .env
```

```env
BOT_TOKEN=...
ADZUNA_APP_ID=...
ADZUNA_APP_KEY=...
ADZUNA_COUNTRY=sg
DATA_DIR=./data
INDO_JOBS_PATH=./data/jobs-id.json
```

Adzuna: [developer.adzuna.com](https://developer.adzuna.com/).  
**Note:** Adzuna has no Indonesia (`id`) index — use `sg` (or `gb` / `us` / …).

```bash
npm run dev
```

## Indonesia catalog

Edit [`data/jobs-id.json`](data/jobs-id.json) to add/update Indo roles (`id`, `title`, `company`, `location`, `tags`, `description`, `url`).  
URLs must be `https://`. The bot reloads this file on each search.  
Sample `example.com` links are placeholders — the bot does not show an Open button for those hosts.

## Security & privacy

Aligned with [OWASP Top 10](https://owasp.org/www-project-top-ten/) practices for this bot:

- CV PDF: in-memory only, size/magic checks, buffer wipe after parse
- Secrets: `.env` only — never commit; never log tokens or Adzuna keys
- SQLite: parameterized queries; per-chat data keyed by Telegram `chat_id`
- Job links: `https` allowlist only (blocks `javascript:` / `data:`)
- Catalog path: no path traversal outside project/data roots
- HTML replies: escaped dynamic fields

## Deploy (Railway)

Long polling (no domain/webhook). Node **20+**.

1. Push this repo to GitHub (never commit `.env` or `*.sqlite*`; **do** commit `data/jobs-id.json`).
2. Railway → New Project → Deploy from GitHub → `jobmatch-helper`.
3. **Variables** (required for production):
   - `BOT_TOKEN`
   - `ADZUNA_APP_ID`
   - `ADZUNA_APP_KEY`
   - `ADZUNA_COUNTRY=sg`
   - `DATA_DIR=/data`
   - `INDO_JOBS_PATH=./data/jobs-id.json`
4. **Volume (important):** mount a persistent volume at `/data` only.  
   Do **not** mount over `./data` in the repo — that hides `jobs-id.json` and empties the Indo catalog.  
   SQLite lives on the volume (`DATA_DIR=/data`); the Indo JSON stays on the deploy image (`INDO_JOBS_PATH=./data/jobs-id.json`).
5. Start command: `npm start` (uses `tsx`; needs successful `npm install` including native `better-sqlite3`).
6. Logs should show: `JobMatch Helper bot @jobmatch_tools_bot is running (polling).`
7. **Stop any local** `npm run dev` so only one poller hits Telegram.

If `better-sqlite3` fails to install on Railway, pin Node 20 and/or add a Dockerfile with `python3`, `make`, and `g++`.

## BotFather

**About**
```text
Temukan job yang match dengan CV-mu. Upload PDF, lihat rekomendasi + skor kecocokan.
```

**Description**
```text
JobMatch Helper mencari lowongan dari katalog Indonesia + Adzuna yang cocok dengan CV atau keyword-mu.

Cara pakai: /match → (opsional preferensi) → upload CV PDF (boleh langsung di step pertama).
Atau /search. Aktifkan /alerts untuk notifikasi lowongan baru.
```

**Commands**
```text
start - Mulai & cara pakai
match - Cari job dari CV
search - Cari by judul/keyword
alerts - Notifikasi lowongan baru
profile - Lihat profil tersimpan
cancel - Batalkan session
done - Selesai + thank you
help - Bantuan singkat
```

## Sibling

Deep JD vs CV scoring: [@cv_screener_bot](https://t.me/cv_screener_bot).
