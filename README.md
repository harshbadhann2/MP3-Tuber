# 🎵 MP3 Tuber

**™ HARSH BADHAN**

A super-light, self-hosted web app that converts YouTube videos into MP3 files for **personal use** with content you own or have permission to download. Built with a zero-dependency Node server and a clean, modern frontend.

---

## ✅ Highlights

- **Ultra lightweight** — no frontend framework and no npm dependencies
- **Fast conversions** — powered by `yt-dlp` + `ffmpeg`
- **Privacy-friendly** — runs locally, your data stays on your machine
- **Auto-cleanup** — downloads expire after 1 hour
- **Simple UI** — paste, confirm rights, convert, download

---

## ⚙️ Requirements

| Tool | Version | Check |
|------|---------|-------|
| Node.js | 18+ | `node --version` |
| yt-dlp | Latest | `yt-dlp --version` |
| ffmpeg | Latest | `ffmpeg -version` |

### Install yt-dlp + ffmpeg

**macOS**
```bash
brew install yt-dlp ffmpeg
```

**Ubuntu / Debian**
```bash
sudo apt update
sudo apt install ffmpeg
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
```

**Windows (PowerShell)**
```bash
choco install yt-dlp ffmpeg
```

---

## 🚀 Quick Start

No dependencies to install.

```bash
# run the server
node server.js

# optional custom port
PORT=3030 node server.js
```

Open your browser:
```
http://localhost:3000
```

---

## 🧭 How It Works

1. Paste a YouTube link
2. Confirm you have rights to download it
3. Click **Generate MP3**
4. Download your file

---

## 🔌 API Endpoints

`POST /api/convert`
```json
{
  "url": "https://youtube.com/watch?v=VIDEO_ID",
  "rightsConfirmed": true
}
```
Response:
```json
{ "jobId": "abc123" }
```

`GET /api/status/:id`
```json
{
  "status": "processing",
  "progress": 45,
  "message": "Downloading audio"
}
```

`GET /api/download/:id`
Downloads the MP3.

`GET /api/diagnostics`
Returns whether `yt-dlp` and `ffmpeg` are available.

---

## 🗂 Project Structure

```
public/        # UI files (HTML/CSS/JS)
server.js      # Zero-dependency Node server
downloads/     # Auto-created output folder (ignored by git)
```

---

## 🧼 Lightweight Repo Notes

This repository is intentionally tiny:

- No `node_modules/`
- No build artifacts
- Generated downloads are ignored in `.gitignore`

---

## ⚠️ Legal & Responsible Use

This tool is for **personal use only** with content you own or have explicit permission to download. Respect creators and local laws.

---

## 🧰 Troubleshooting

- **“Server is missing required dependencies”** → Install `yt-dlp` and `ffmpeg`.
- **“Conversion failed”** → Try a different video or update `yt-dlp`.
- **No download link appears** → Wait for the status to reach 100% or check diagnostics.

---

## 📄 License

Not specified. Add a license if you plan to distribute.

---

## 📬 Contact

If you need help customizing or deploying this project, feel free to reach out.
