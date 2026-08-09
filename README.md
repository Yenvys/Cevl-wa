# Yenvy Bot WhatsApp

Yenvy adalah bot WhatsApp multi-fitur yang ditulis dalam NodeJS menggunakan library Baileys. Bot ini memiliki struktur *plugin-based* yang dinamis (Universal Chat Style) yang memungkinkan perubahan, penambahan, dan penghapusan fitur tanpa harus merestart ulang bot (Hot Reload).

## ✨ Fitur Utama
- **Plugin Dinamis**: File plugin otomatis dimuat ulang jika ada perubahan (`chokidar` auto-watch).
- **Mode Fleksibel**: Dapat berjalan di mode Publik, Self, atau Grup-only (`.mode`).
- **AI Integrasi**: Didukung oleh Google Gemini (`.ai`).
- **Downloader Lengkap**: YouTube, TikTok, Threads, Instagram, dll.
- **Manajemen Grup**: Autoclose (jam malam otomatis), Antilink, Welcome & Goodbye messages.
- **Roleplay / RPG Sistem**: Uang, Inventory, Leveling, Market.
- **Koneksi Stabil**: Mendukung koneksi menggunakan metode Pairing Code.

## 🚀 Cara Instalasi

1. **Clone repository ini:**
   ```bash
   git clone https://github.com/Yenvys/bot-wa.git
   cd bot-wa
   ```

2. **Instal dependensi:**
   ```bash
   npm install
   ```

3. **Konfigurasi Environment (`.env`):**
   Duplikat file `.env.example` dan ubah namanya menjadi `.env`.
   Lalu isi seluruh kredensial API dan nomor Anda (Owner & Pairing):
   ```env
   OWNER_NUMBERS=628...
   PAIRING_NUMBER=628...
   GEMINI_API_KEY=...
   JEREXD_API_KEY=...
   ```

4. **Jalankan Bot:**
   ```bash
   npm start
   ```

## 🛠️ Panduan Penggunaan
- Saat pertama kali berjalan, bot akan memunculkan *Pairing Code* di terminal jika `PAIRING_NUMBER` sudah diatur di `.env`.
- Buka aplikasi WhatsApp Anda > Tautkan Perangkat > Masukkan kode yang muncul di terminal.
- Ketik `.menu` atau `.help` di dalam chat WhatsApp untuk melihat seluruh daftar command yang tersedia.

## 🔧 Struktur Folder
- `/plugins/`: Menyimpan semua modul fitur (commands). Tambah file `.js` baru di sini dan bot akan langsung memuatnya secara otomatis!
- `/lib/`: Library inti, database (SQLite), response handling, dan middleware.
- `/data/`: Menyimpan database lokal, file sesi login, dan pengaturan global. (Folder ini diabaikan oleh Git untuk keamanan privasi).
