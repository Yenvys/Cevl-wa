/**
 * lib/rpg/jobs.js
 * Kumpulan data static pekerjaan, nominal gaji, kuis interview, dan task harian RPG
 * Format: ESM (Modern Export/Import Engine)
 */

export const jobs = {
    kuli: {
        nama: "Kuli Bangunan",
        reqLevel: 1,
        gaji: 100,
        interview: [
            { soal: "Harga paku sekilo 15.000, mandor ngasih duit 50.000 suruh beli 2 kilo. Kembaliannya?", opsi: ["20000", "15000", "25000"], jawaban: "a" },
            { soal: "Kalo lu ngaduk semen 2 sak sama pasir 4 karung, butuh berapa air?", opsi: ["1 tangki", "secukupnya", "1 gayung"], jawaban: "b" },
            { soal: "Alat buat ngeratain semen di tembok namanya apa?", opsi: ["Roksas", "Sendok", "Palu"], jawaban: "a" },
            { soal: "Warna helm proyek buat pekerja umum biasanya warna apa?", opsi: ["Putih", "Kuning", "Hijau"], jawaban: "b" },
            { soal: "Sebutin singkatan dari SNI!", opsi: ["Standar Nasional Indonesia", "Semen Nyampur Indah", "Semua Negara Ikut"], jawaban: "a" }
        ],
        tasks: [
            { soal: "Ada mandor dateng! Ketik *SIAP*", jawab: "siap" },
            { soal: "Awas semen tumpah! Ketik *TANGKAP*", jawab: "tangkap" },
            { soal: "Cangkul lu patah! Ketik *GANTI*", jawab: "ganti" }
        ]
    },
    kurir: {
        nama: "Kurir Paket",
        reqLevel: 2,
        gaji: 200,
        interview: [
            { soal: "Apa kepanjangan dari COD?", opsi: ["Cash On Delivery", "Call On Delivery", "Cash On Done"], jawaban: "a" },
            { soal: "Kalo rumah kosong, paketnya harus diapain biar aman?", opsi: ["Bawa pulang", "Buang", "Foto dan titip tetangga"], jawaban: "c" },
            { soal: "Singkatan dari resi otomatis biasanya disebut?", opsi: ["AWB", "BWA", "ABC"], jawaban: "a" },
            { soal: "Alat transportasi utama kurir adalah?", opsi: ["Mobil", "Motor", "Sepeda"], jawaban: "b" },
            { soal: "Kalo paket rusak di jalan, siapa yang rugi?", opsi: ["Tuhan", "Kurir", "Pembeli"], jawaban: "b" }
        ],
        tasks: [
            { soal: "Ada anjing ngejar! Ketik *LARI*", jawab: "lari" },
            { soal: "Paket mau jatoh! Ketik *PEGANG*", jawab: "pegang" },
            { soal: "Ban motor bocor! Ketik *DORONG*", jawab: "dorong" }
        ]
    },
    kasir: {
        nama: "Kasir Warung",
        reqLevel: 3,
        gaji: 350,
        interview: [
            { soal: "Pelanggan beli udud 23.500, bayar pake 50.000. Kembaliannya?", opsi: ["27500", "26500", "30000"], jawaban: "b" },
            { soal: "Ada orang beli galon 19.000 sama telor 11.000. Dia ngasih 50.000, kembaliannya?", opsi: ["20000", "21000", "19000"], jawaban: "a" },
            { soal: "Sebutin singkatan dari UMKM!", opsi: ["Usaha Mikro Kecil Menengah", "Usaha Makan Kita Makan", "Unit Mobil Kecil Mewah"], jawaban: "a" },
            { soal: "Kalo ada barang kadaluarsa, harusnya diapain?", opsi: ["Diskon", "Dibuang", "Dimakan"], jawaban: "b" },
            { ...{} || "Pajak Pertambahan Nilai", opsi: ["Pajak Pertambahan Nilai", "Pajak Paling Nyata", "Pajak Pusat Negara"], jawaban: "a" }
        ],
        tasks: [
            { soal: "Uang kembalian kurang! Ketik *CEK*", jawab: "cek" },
            { soal: "Ada antrian panjang! Ketik *CEPAT*", jawab: "cepat" },
            { soal: "Barang kaga discan! Ketik *ULANG*", jawab: "ulang" }
        ]
    },
    satpam: {
        nama: "Satpam Komplek",
        reqLevel: 4,
        gaji: 500,
        interview: [
            { soal: "Alat komunikasi yang dipake satpam namanya apa?", opsi: ["Handphone", "HT", "Telepon Umum"], jawaban: "b" },
            { soal: "Kalo ada tamu malem-malem, hal pertama yang diminta adalah?", opsi: ["Duit", "KTP", "Makanan"], jawaban: "b" },
            { soal: "Singkatan dari Satpam adalah?", opsi: ["Satuan Pengamanan", "Satuan Pembersih", "Satuan Penjaga"], jawaban: "a" },
            { soal: "Warna seragam baru satpam sekarang mirip seragam apa?", opsi: ["TNI", "Polisi", "Damkar"], jawaban: "b" },
            { soal: "Apa singkatan dari TKP?", opsi: ["Tempat Kejadian Perkara", "Tempat Kumpul Pemuda", "Tempat Kerja Paksa"], jawaban: "a" }
        ],
        tasks: [
            { soal: "Ada maling masuk! Ketik *TANGKAP*", jawab: "tangkap" },
            { soal: "Pagar lupa dikunci! Ketik *KUNCI*", jawab: "kunci" },
            { soal: "Waktunya patroli! Ketik *JALAN*", jawab: "jalan" }
        ]
    },
    ojol: {
        nama: "Driver Ojol",
        reqLevel: 5,
        gaji: 700,
        interview: [
            { soal: "Jarak 5km, ongkos per km 2500. Total ongkosnya berapa?", opsi: ["10000", "15000", "12500"], jawaban: "c" },
            { soal: "Pelanggan topup 50.000, admin 2.000. Berapa total bayarnya?", opsi: ["50000", "52000", "48000"], jawaban: "b" },
            { soal: "Singkatan dari GPS adalah?", opsi: ["Global Positioning System", "Global Point System", "General Power System"], jawaban: "a" },
            { soal: "Kalo dapet orderan fiktif, lapornya ke mana?", opsi: ["Polisi", "Kantor Cabang", "Dukun"], jawaban: "b" },
            { soal: "Nama jalan utama di Cirebon yang ada mall CSB-nya?", opsi: ["Kartini", "Cipto Mangunkusumo", "Siliwangi"], jawaban: "b" }
        ],
        tasks: [
            { soal: "Lampu merah nyala! Ketik *BERHENTI*", jawab: "berhenti" },
            { soal: "Ban kena paku! Ketik *TAMBAL*", jawab: "tambal" },
            { soal: "Ada polisi tidur! Ketik *PELAN*", jawab: "pelan" }
        ]
    },
    admin: {
        nama: "Admin Olshop",
        reqLevel: 6,
        gaji: 1000,
        interview: [
            { soal: "Apa sebutan buat pembeli yang nanya doang tapi kaga beli?", opsi: ["Buyer", "CLBK", "Seller"], jawaban: "b" },
            { soal: "Istilah buat stok barang yang lagi abis?", opsi: ["Sold Out", "Ready", "Pre-Order"], jawaban: "a" },
            { soal: "Kalo ada pembeli marah-marah, admin harus gimana?", opsi: ["Blokir", "Sabar dan sopan", "Balas Marah"], jawaban: "b" },
            { ...{} || "Ongkos Kirim", opsi: ["OK", "Ongkir", "Kirim"], jawaban: "b" },
            { soal: "Istilah kirim barang atas nama orang lain?", opsi: ["Dropship", "Reseller", "Titip"], jawaban: "a" }
        ],
        tasks: [
            { soal: "Ada chat spam! Ketik *BLOKIR*", jawab: "blokir" },
            { soal: "Input resi paket! Ketik *UPDATE*", jawab: "update" },
            { soal: "Barang abis stok! Ketik *RESTOCK*", jawab: "restock" }
        ]
    },
    teknisi: {
        nama: "Teknisi Warnet",
        reqLevel: 7,
        gaji: 1500,
        interview: [
            { soal: "Bocil main billing 3 jam, per jam 3000. Bayar 10.000, susuknya?", opsi: ["500", "1000", "2000"], jawaban: "b" },
            { soal: "Sebutin singkatan dari LAN!", opsi: ["Local Area Network", "Link Area Net", "Lari Area Net"], jawaban: "a" },
            { soal: "Kalo PC tiba-tiba ngehang, langkah pertama biasanya dipencet apa?", opsi: ["Banting", "Restart", "Tidur"], jawaban: "b" },
            { soal: "Alat buat nyolok kabel internet ke PC namanya?", opsi: ["RJ45", "USB", "HDMI"], jawaban: "a" },
            { soal: "Singkatan dari IP Address adalah?", opsi: ["Internet Protocol", "Indo Protocol", "Internal Point"], jawaban: "a" }
        ],
        tasks: [
            { soal: "Kabel LAN putus! Ketik *SAMBUNG*", jawab: "sambung" },
            { soal: "Bocil berisik! Ketik *DIAM*", jawab: "diam" },
            { soal: "PC kena virus! Ketik *SCAN*", jawab: "scan" }
        ]
    },
    designer: {
        nama: "Graphic Designer",
        reqLevel: 8,
        gaji: 2200,
        interview: [
            { ...{} || "Portable Network Graphics", opsi: ["JPG", "PNG", "GIF"], jawaban: "b" },
            { soal: "Warna primer buat cetakan (printing)?", opsi: ["RGB", "CMYK", "BW"], jawaban: "b" },
            { soal: "Software buatan Adobe buat edit foto?", opsi: ["Photoshop", "Paint", "Excel"], jawaban: "a" },
            { soal: "Singkatan dari UI dalam desain?", opsi: ["User Interface", "User Indo", "Ultra Indo"], jawaban: "a" },
            { soal: "Jenis font yang kaga punya 'kaki' disebut?", opsi: ["Serif", "Sans Serif", "Arial"], jawaban: "b" }
        ],
        tasks: [
            { soal: "Client minta revisi! Ketik *SABAR*", jawab: "sabar" },
            { soal: "PC lu lemot! Ketik *RENDER*", jawab: "render" },
            { soal: "Font lu kaga cocok! Ketik *GANTI*", jawab: "ganti" }
        ]
    },
    editor: {
        nama: "Video Editor",
        reqLevel: 9,
        gaji: 3500,
        interview: [
            { soal: "Istilah buat motong klip video?", opsi: ["Cut", "Copy", "Paste"], jawaban: "a" },
            { soal: "Frame per second disingkat jadi apa?", opsi: ["SFP", "FPS", "SPF"], jawaban: "b" },
            { soal: "Proses akhir nggabungin semua klip jadi satu file video?", opsi: ["Saving", "Rendering", "Loading"], jawaban: "b" },
            { soal: "Resolusi 1920x1080 sering disebut?", opsi: ["4K", "HD", "Full HD"], jawaban: "c" },
            { ...{} || "Fade In / Out", opsi: ["Fade", "Sharp", "Blur"], jawaban: "a" }
        ],
        tasks: [
            { soal: "File korup! Ketik *RECOVER*", jawab: "recover" },
            { soal: "Timeline berantakan! Ketik *RAPI*", jawab: "rapi" },
            { soal: "Kurang transisi! Ketik *EFEK*", jawab: "efek" }
        ]
    },
    programmer: {
        nama: "Programmer",
        reqLevel: 10,
        gaji: 5000,
        interview: [
            { soal: "Apa output dari console.log(typeof null) di JavaScript?", opsi: ["Null", "Object", "Undefined"], jawaban: "b" },
            { soal: "Sebutin nama modul bawaan NodeJS buat baca file sistem!", opsi: ["HTTP", "FS", "PATH"], jawaban: "b" },
            { soal: "Database yang kita pake sekarang di bot ini namanya?", opsi: ["MySQL", "MongoDB", "SQLite"], jawaban: "b" },
            { soal: "Singkatan dari API adalah?", opsi: ["Application Programming Interface", "Aplikasi Paling Indah", "Apple Point Info"], jawaban: "a" },
            { soal: "Tag HTML buat bikin link/tautan?", opsi: ["<link>", "<a>", "<p>"], jawaban: "b" }
        ],
        tasks: [
            { soal: "Ada BUG di Api nya! Ketik *FIX*", jawab: "fix" },
            { soal: "Lu lupa titik koma! Ketik *CEK*", jawab: "cek" },
            { soal: "Server lu down! Ketik *RESTART*", jawab: "restart" }
        ]
    }
};