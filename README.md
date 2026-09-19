# Nokos Checker Bot

Telegram bot untuk mengecek nomor WhatsApp terdaftar/tidak menggunakan Baileys (WhatsApp Web API).

## Fitur

- 🔗 **Pairing Code** - Hubungkan WhatsApp tanpa QR code, cukup masukkan nomor HP
- 📋 **Bulk Check** - Upload file `.txt` berisi daftar nomor, dapat 2 file hasil (terdaftar/belum)
- 📱 **Manual Check** - Cek nomor satu per satu
- 📊 **Status** - Cek status koneksi WhatsApp
- 🔌 **Disconnect** - Putuskan koneksi kapan saja
- 👥 **Multi-user** - Setiap user punya session WhatsApp terpisah

## Instalasi

```bash
# 1. Clone/buat folder project
cd nokos-checker

# 2. Install dependencies
npm install

# 3. Copy .env.example ke .env dan isi
cp .env.example .env
# Edit .env dengan token bot Telegram kamu

# 4. Jalankan
npm start
```

## Cara Dapatkan BOT_TOKEN

1. Chat `@BotFather` di Telegram
2. `/newbot` → ikuti instruksi
3. Copy token yang diberikan

## Cara Dapatkan ADMIN_ID (opsional)

1. Chat `@userinfobot` di Telegram
2. Copy `Id` yang diberikan

## Penggunaan

1. **Start bot** - Kirim `/start` ke bot
2. **Hubungkan WhatsApp** - Klik "🔗 Hubungkan WhatsApp" → masukkan nomor (format: `628xxxxxxxxxx`)
3. **Pairing Code** - Bot akan kirim kode pairing, masukkan di WhatsApp > Perangkat Tertaut > Tautkan Perangkat
4. **Cek Nomor** - Setelah terhubung, gunakan:
   - "📋 Cek Nomor (File)" - Upload file `.txt` (satu nomor per baris)
   - "📱 Cek Nomor (Manual)" - Ketik nomor langsung

## Format File Input

```txt
6281234567890
6281234567891
6281234567892
```

## Output

Bot akan kirim 2 file:
- `registered_xxx.txt` - Nomor yang TERDAFTAR di WhatsApp
- `unregistered_xxx.txt` - Nomor yang BELUM TERDAFTAR

## Struktur Folder

```
nokos-checker/
├── index.js          # Main entry point
├── package.json
├── .env              # Config (jangan commit!)
├── sessions/         # Session WhatsApp per user
│   └── user_<id>/
└── checks/           # Hasil cek nomor per user
    └── user_<id>/
```

## ⚠️ Peringatan Penting

**WhatsApp MELARANG pengecekan massal nomor (number enumeration).**

- Akun WhatsApp yang digunakan **AKAN KENA BAN** (device ban / permanent ban)
- Bukan "kalau", tapi "kapan" - biasanya 1-7 hari
- Nomor yang dipakai mengecek adalah nomor WhatsApp yang dihubungkan oleh owner/admin — semua user memakai session tersebut, jadi semua risiko ban ditanggung nomor itu
- Gunakan nomor **khusus/baru** yang siap diganti kapan saja
- Rate limit: bot sudah pakai delay 0,5 detik per nomor, tapi tetap berisiko
- **Gunakan dengan risiko sendiri**

## Troubleshooting

### "Connection closed" / Sering disconnect
- Pastikan koneksi internet stabil
- WhatsApp Web hanya bisa 1 device aktif per nomor (selain HP utama)

### Pairing code tidak muncul
- Pastikan nomor format benar: `628xxxxxxxxxx` (tanpa +, tanpa 0 di depan)
- Coba disconnect dulu lalu hubungkan lagi

### Bot tidak merespons
- Cek log console untuk error
- Pastikan BOT_TOKEN benar

## Deploy ke VPS (PM2)

```bash
npm install -g pm2
pm2 start index.js --name nokos-checker
pm2 startup
pm2 save
```

## License

MIT - Use at your own risk.