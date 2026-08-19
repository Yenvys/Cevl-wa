# Cevl Bot WhatsApp

Cevl adalah Simple bot WhatsApp yang ditulis dalam NodeJS menggunakan library Baileys. struktur *plugin-based* yang dinamis (Universal Chat Style) memungkinkan perubahan, penambahan, dan penghapusan fitur tanpa merestart bot (Hot Reload).

##  Fitur Utama
- **Plugin Dinamis**: File plugin otomatis dimuat ulang jika ada perubahan (`chokidar` auto-watch).
- **Mode Fleksibel**: Dapat berjalan di mode Publik, Self, atau Grup-only (`.mode`).
- **AI Integrasi**: Didukung oleh Google Gemini (`.ai`).
- **Downloader**: YouTube, TikTok, Threads, Instagram, dll.
- **Manajemen Grup**: Autoclose (jam malam otomatis), Antilink, Welcome & Goodbye messages.
- **Roleplay / RPG Sistem**: Uang, Inventory, Leveling, Market.
- **Koneksi Stabil**: Mendukung koneksi menggunakan metode Pairing Code.

## Persyaratan (Requirements)
Sebelum menginstal bot ini, pastikan sistem Anda memiliki:
- **Node.js** (Gunakan versi LTS: v18, v20, atau v22. *Jangan gunakan versi terbaru jika mengalami error saat `npm install`*)
- **Git**
- **FFmpeg** (opsional, disarankan untuk fitur manipulasi media)

##  Cara Instalasi

1. **Clone repository ini:**
   ```bash
   git clone https://github.com/Yenvys/Cevl-wa.git
   cd Cevl-wa
   ```

2. **Instal dependensi:**
   ```bash
   npm install
   ```

3. **Konfigurasi Environment (`.env`):**
   Copy file `.env.example` dan ubah namanya jadi `.env`.
   Lalu isi (API, Owner & Pairing):
   ```env
   OWNER_NUMBERS=628...
   PAIRING_NUMBER=628...
   GEMINI_API_KEY=...
   ....
   ```

4. **Jalankan Bot:**
   ```bash
   npm start
   ```

##  Panduan Penggunaan
- Saat pertama kali berjalan, bot akan memunculkan *Pairing Code* di terminal jika `PAIRING_NUMBER` sudah diatur di `.env`.
- Buka aplikasi WhatsApp Anda > Tautkan Perangkat > Masukkan kode yang muncul di terminal.
- Ketik `.menu` atau `.help` dalam chat WhatsApp untuk melihat seluruh daftar command yang tersedia.

##  Struktur Folder
- `/plugins/`: Menyimpan semua modul fitur (commands). Tambah file `.js` baru di sini dan bot langsung memuat secara otomatis!
- `/lib/`: Library inti, database (SQLite), response handling, dan middleware.
- `/data/`: Menyimpan database lokal, file sesi login, dan pengaturan global. 
