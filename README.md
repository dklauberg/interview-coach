# Interview Coach 🎙️

Practice English job interviews **by voice** and get AI feedback. Built for two people (e.g. you and your partner) to rehearse interviews and sharpen English over time.

## How it works

1. **Setup** — pick a profile name, paste/upload your résumé (PDF/DOCX), paste the job description, optionally answer a few AI-suggested clarifying questions, choose a **15 min (short)** or **30 min (long)** session, and hit **Start**.
2. **Interview** — the interviewer asks one question at a time (read aloud). Click **Start answering** to record, **Finish answer** to stop. Your answer is transcribed locally and the next (adaptive) question follows, until time/budget runs out.
3. **Feedback** — you get the full transcript, **English corrections** (grammar / vocabulary / phrasing / tense) with explanations, and a **scored report** across **Technique**, **Clarity**, and **Word usage**, plus strengths, areas to improve, and 3 concrete next actions. Every session is saved so you can track progress.

## The stack (and the cost model)

| Piece | Tech | Cost |
|---|---|---|
| App | Next.js (React, App Router) | free, runs on `localhost` |
| Speech-to-text | **Whisper, local in-browser** (transformers.js) | free — model downloads once, then runs on-device |
| Text-to-speech | Browser Web Speech API | free |
| Interview questions | **Claude Sonnet 4.6** | pay-per-use (cheap) |
| Corrections + scoring | **Claude Opus 4.8** | pay-per-use |

Prompt caching keeps the résumé + job description cheap to reuse across turns. Audio never leaves your machine; only the **transcribed text** is sent to Claude. Estimated cost: roughly **US$0.10–0.20 per 30-min session** (no subscription — you only pay the Anthropic API per use).

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Add your Anthropic API key (pay-per-use, no subscription)
#    Get one at https://console.anthropic.com/settings/keys
cp .env.local.example .env.local
#    then edit .env.local and paste your key

# 3. Run
npm run dev
```

Open http://localhost:3000 in **Chrome or Edge** (best Web Speech + WebGPU support) and allow microphone access.

## Notes & gotchas

- **First run is slow**: the Whisper model (~150 MB, `whisper-base.en`) downloads once on the first interview, then is cached by the browser. Needs internet that first time.
- **Microphone**: the browser will ask for permission. `localhost` is treated as a secure origin, so the mic works without HTTPS.
- **The Claude API is separate from a Claude.ai subscription** — it's billed per token on its own account at console.anthropic.com.
- **OneDrive**: this project lives in a OneDrive folder. `node_modules` and `.next` are git-ignored, but OneDrive may still try to sync them and slow things down. If the dev server feels sluggish, consider moving the project outside OneDrive (or excluding the folder from sync).

## Runs on Windows, macOS, and Linux

The app is fully cross-platform — same `npm install` / `npm run dev` everywhere. Whisper (STT), the Anthropic SDK, résumé parsing, and microphone recording all work identically on Linux/Chromium.

**One Linux caveat — text-to-speech voices.** The interviewer's voice uses the browser's Web Speech API. On Linux, Chromium often ships with **no TTS voices installed**, so the question may appear on screen but not be spoken. Fix it by installing a speech engine:

```bash
# Debian / Ubuntu
sudo apt install speech-dispatcher espeak-ng
# then restart the browser
```

If voices are still unavailable, the app degrades gracefully: the question is always shown as text, you just won't hear it (no crash). Windows and macOS ship with voices, so this only affects Linux.

Tip: on Linux there's no OneDrive sync overhead, so the dev server typically runs faster. To use the app on multiple machines, copy the folder **without** `node_modules` and `.env.local`, then run `npm install` and recreate `.env.local` on each.

## Deploy: self-host on your always-on Linux PC

Goal: run the app on your home PC and reach it from any computer over the web, with HTTPS (required for the microphone) and a password. The app + tunnel **auto-start on boot**, so you never run commands by hand. If you turn the PC off at night, the app is simply offline until you turn it back on — fine for practice.

### Step 1 — Build and configure (once)

```bash
cd ~/Interview                 # wherever the project lives
npm install
cp .env.local.example .env.local
#   edit .env.local: set ANTHROPIC_API_KEY and a strong APP_PASSWORD
npm run build
npm start                      # test: should serve on http://localhost:3000
```

In the [Anthropic console](https://console.anthropic.com), also set a **monthly spend limit** as a safety net.

### Step 2 — Auto-start the app on boot (systemd)

A ready template is in [`deploy/interview-coach.service`](deploy/interview-coach.service). Edit the `USER` / path placeholders, then:

```bash
sudo cp deploy/interview-coach.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now interview-coach     # starts now + on every boot
systemctl status interview-coach                # verify it's running
```

### Step 3 — Put it on the web with a Cloudflare Tunnel (free HTTPS, no port-forwarding)

Install `cloudflared`:

```bash
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb
```

**Recommended — stable URL (needs a domain on Cloudflare, ~R$40/year):** gives a fixed address like `https://interview.yourdomain.com` that doesn't change when the PC restarts, and auto-starts on boot.

```bash
cloudflared tunnel login                                   # pick your domain in the browser
cloudflared tunnel create interview-coach                  # note the Tunnel ID it prints
cloudflared tunnel route dns interview-coach interview.yourdomain.com
```

Create your config from the template in [`deploy/cloudflared-config.yml`](deploy/cloudflared-config.yml) — copy it and fill in the 3 placeholders (`<TUNNEL_ID>`, `USER`, `interview.yourdomain.com`):

```bash
mkdir -p ~/.cloudflared
cp deploy/cloudflared-config.yml ~/.cloudflared/config.yml
#   then edit ~/.cloudflared/config.yml
```

Install it as a boot service:

```bash
sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

**Quick alternative — no domain needed:** `cloudflared tunnel --url http://localhost:3000` prints a temporary `https://<random>.trycloudflare.com` URL. Easy for testing, but the URL **changes every restart**, so it's not great for daily on/off use.

### Daily on/off — what to expect

- Turn the PC **on** (7h): systemd starts the app and the tunnel automatically → reachable at your URL within seconds. No commands.
- Turn it **off** (22h): the app goes offline until morning.
- First load from a new computer: the browser asks for the password (any username), then downloads the Whisper model once. Use **Chrome/Edge** and allow the microphone.

Cost: **R$0** for hosting (just electricity + the per-use Claude API). The heavy speech recognition runs in each visitor's browser, so your 8 GB PC stays light as a server.

## Also included

- **Delivery metrics** — speaking pace (words/min) and filler-word count/rate are computed locally from your audio + transcript and shown on the report.
- **Example answers** — on the report, "Show example answers" generates a strong model answer (STAR-structured, tailored to your résumé/role) for every question, to compare against.
- **Progress dashboard** (`/progress`) — line chart of Overall/Technique/Clarity/Word-usage scores over time, per profile, plus a session history with pace and filler stats.
- **PDF export** — "Download PDF" on the report uses the browser's print-to-PDF with a clean print stylesheet.
- **Clean‑clean error handling** — runs gracefully and tells you exactly what to fix if the API key is missing.

## Ideas to extend later

- Interviewer persona / accent selection; "retry this question" mode.
- Per-question audio replay; pronunciation feedback.
