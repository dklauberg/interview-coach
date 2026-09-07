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
| Text-to-speech | **Kokoro, local in-browser** (Web Speech as fallback) | free — model downloads once, then runs on-device |
| Interview questions | **Claude Opus 5** (low effort) | pay-per-use |
| Corrections + scoring | **Claude Opus 5** (high effort) | pay-per-use |

One model runs the whole app; what changes per route is the **effort** level — low while the interview is live (the candidate is waiting on the next question), high for the final report (where feedback quality is the product). Prompt caching keeps the résumé + job description cheap to reuse across turns. Audio never leaves your machine; only the **transcribed text** is sent to Claude. Estimated cost: roughly **US$0.20–0.40 per 30-min session** (no subscription — you only pay the Anthropic API per use).

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

### Linux Lite (and other Ubuntu-based lightweight distros)

**The short way** — one command does everything below (system packages, Node 20, Chrome, clone, `npm install`, `.env.local`, build, and optionally the boot service). It's safe to re-run, and it never overwrites an existing `.env.local`:

```bash
git clone https://github.com/dklauberg/interview-coach ~/Interview
bash ~/Interview/deploy/install-linux.sh
```

Re-run the same script after a `git pull` to rebuild and restart the service.

**The manual way** — Linux Lite is built on Ubuntu LTS, so everything works, with two adjustments:

**1. Node from the distro repo is too old.** Linux Lite's `apt` ships Node 12–18 depending on the release; Next.js 15 needs 20+. Install NodeSource instead:

```bash
node -v   # if this is missing or below v20, run the next two lines
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

**2. Use a Chromium-based browser, not the bundled Firefox.** The voice model runs much faster on WebGPU, which Chrome/Chromium enables by default and Firefox does not. Linux Lite ships without snap, so install the `.deb` directly:

```bash
wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
sudo apt install -y ./google-chrome-stable_current_amd64.deb
```

Firefox still works — the app just falls back to running the voice on the CPU, which is slower to start each question.

**On older hardware** (Linux Lite's usual target), expect the first interview to be slow: the two models total about 170 MB to download and both then run on the CPU if there's no usable GPU. Budget ~4 GB of RAM for a comfortable session. If transcription drags, `NEXT_PUBLIC_WHISPER_MODEL=Xenova/whisper-tiny.en` in `.env.local` roughly halves the work at some cost in accuracy.

**One Linux caveat — the fallback voice.** The interviewer normally speaks with Kokoro, which runs inside the browser and needs nothing installed. Only if that model fails to load does the app fall back to the browser's Web Speech API — and on Linux, Chromium often ships with **no TTS voices installed**, so in that fallback the question would appear on screen but not be spoken. Install a speech engine if you want the fallback to work too:

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

## Voice quality (the bits that make it sound like a person)

- **Neural voice, on-device** — Kokoro synthesizes the interviewer's questions. It runs on WebGPU when available and CPU otherwise; if the model can't load at all, the app falls back to the OS voice so it never goes silent.
- **Sentence streaming** — the first sentence starts playing while the rest is still being generated, so questions begin in about a second instead of after the whole paragraph. Sentences are scheduled on one Web Audio timeline, so playback is gapless.
- **Voice and speed picker** — choose from seven Kokoro voices (US/UK, male/female) and five speeds right on the interview screen; the choice is remembered.
- **Speech-aware text cleanup** — markdown, emoji and written abbreviations (`e.g.`, `etc.`, `%`) are rewritten the way a person would read them before synthesis.
- **Better recognition of your voice** — the mic is captured with echo cancellation, noise suppression and auto gain; recordings are downmixed to mono, silence-trimmed against the recording's own noise floor, and peak-normalized before Whisper sees them. Whisper decodes greedily with an n-gram repeat block, and its stock "thanks for watching"-type hallucinations on empty audio are filtered out.
- **Space bar** starts and stops recording; the mic is acquired once per session instead of on every answer.

Want higher accuracy for strong accents and don't mind it being ~3x slower? Set `NEXT_PUBLIC_WHISPER_MODEL=Xenova/whisper-small.en` in `.env.local`.

## Also included

- **Delivery metrics** — speaking pace (words/min) and filler-word count/rate are computed locally from your audio + transcript and shown on the report.
- **Example answers** — on the report, "Show example answers" generates a strong model answer (STAR-structured, tailored to your résumé/role) for every question, to compare against.
- **Progress dashboard** (`/progress`) — line chart of Overall/Technique/Clarity/Word-usage scores over time, per profile, plus a session history with pace and filler stats.
- **PDF export** — "Download PDF" on the report uses the browser's print-to-PDF with a clean print stylesheet.
- **Clean‑clean error handling** — runs gracefully and tells you exactly what to fix if the API key is missing.

## Ideas to extend later

- Interviewer persona / accent selection; "retry this question" mode.
- Per-question audio replay; pronunciation feedback.
