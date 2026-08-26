# Cevl — WhatsApp Bot

Cevl adalah bot WhatsApp multi-fitur yang ditulis dalam Node.js menggunakan library **Baileys**. Arsitektur *plugin-based* yang dinamis memungkinkan penambahan, penghapusan, dan pengeditan fitur tanpa merestart bot (**Hot Reload**).

## Fitur Utama

| Kategori | Fitur |
|----------|-------|
| **AI** | Google Gemini integration (`.ai`) |
| **Downloader** | YouTube, TikTok, Instagram, Threads, Facebook, Twitter/X, dll |
| **Grup** | Autoclose, Antilink, Welcome & Goodbye, Leaderboard |
| **RPG** | Uang, Inventory, Leveling, Market |
| **Tools** | Sticker maker, Image search, Pinterest, Calculator |
| **Owner** | Eval, Exec, Mode, Prefix, Whitelist management |
| **Sistem** | Plugin hot reload, Rate limiting, Auto-backup database |

## Persyaratan

- **Node.js** v18+ (LTS recommended: v20 atau v22)
- **Git**
- **FFmpeg** (diperlukan untuk fitur media — sticker, audio conversion, dll)

## Cara Instalasi

### 1. Clone & Install

```bash
git clone https://github.com/Yenvys/bot-wa.git
cd bot-wa
npm install
```

### 2. Konfigurasi Environment

```bash
cp .env.example .env
```

Edit file `.env` dan isi API keys:

```env
GEMINI_API_KEY=your_gemini_api_key    # (Required) Google AI Studio
PAIRING_NUMBER=628xxx                  # Nomor bot
SERPAPI_KEY=xxx                        # (Optional) Search API
WOLFRAM_APPID=xxx                      # (Optional) Wolfram Alpha
PINTEREST_AUTH_COOKIE=xxx              # (Optional) Pinterest
```

### 3. Jalankan Bot

```bash
# Development (dengan auto-restart)
npm run dev

# Production
npm start
```

Saat pertama kali berjalan, pilih metode login:
1. **Pairing Code** — Masukkan nomor WA, lalu input kode di WhatsApp > Tautkan Perangkat
2. **QR Code** — Scan QR code dari terminal

## Docker (Opsional)

```bash
docker build -t cevl-bot .
docker run -d --name cevl --env-file .env -v ./data:/app/data cevl-bot
```

## PM2 — Production (Opsional)

```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
```

PM2 akan otomatis restart bot jika crash, dengan memory limit 500MB.

## 📁 Struktur Folder

```
├── main.js              # Entry point
├── config.js            # Konfigurasi bot (prefix, mode, owner)
├── ecosystem.config.cjs # PM2 production config
├── Dockerfile           # Docker deployment
├── plugins/             # Semua command/fitur bot
│   ├── ai/              # AI commands
│   ├── downloader/      # Media downloader
│   ├── general/         # Menu, info, ping
│   ├── group/           # Group management
│   ├── owner/           # Owner-only commands
│   ├── rpg/             # RPG game system
│   ├── search/          # Search engines
│   ├── tools/           # Utility tools
│   └── class/           # Class-based features
├── src/                 # Core library
│   ├── handler.js       # Plugin loader & message router
│   ├── client.js        # Baileys socket & reconnect
│   ├── serialize.js     # Message serializer
│   ├── database.js      # SQLite database
│   ├── helper.js        # Media processing & socket wrapper
│   ├── button.js        # Interactive button builder
│   ├── logger.js        # Colored console logger
│   ├── response.js      # Standardized response messages
│   └── utils.js         # Utility functions & middleware
└── data/                # Runtime data (auto-generated)
    ├── session_*/        # WhatsApp session
    ├── db/               # SQLite database + backups
    └── tmp/              # Temporary files
```

## Cara Menambahkan Command Baru

Buat file `.js` baru di `/plugins/` atau sub-direktorinya. Bot akan otomatis memuat tanpa restart!

```javascript
export default {
    cmd: ['namacommand', 'alias1'],
    category: 'tools',
    desc: 'Deskripsi fitur',
    exec: async (m, { sock, query, command }) => {
        if (!query) {
            return m.reply(`Format salah! Contoh: .${command} <teks>`);
        }
        await m.reply(`Hasil: ${query}`);
    }
};
```

## Keamanan & Stabilitas

- **Rate Limiting** — Cooldown 3 detik per user untuk mencegah spam
- **Auto-Backup** — Database otomatis di-backup setiap 24 jam (7 backup terakhir)
- **Memory Cleanup** — Pembersihan otomatis untuk mencegah memory leak
- **Reconnect** — Auto-reconnect dengan exponential backoff (max 10 retry)
- **Integrity Check** — Database dicek saat startup untuk deteksi corruption
- **Temp Cleanup** — File temporary dibersihkan otomatis saat startup

## 📄 License

MIT © [Yenvys](https://github.com/Yenvys)
