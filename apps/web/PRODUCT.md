# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Mekanik, kasir, dan supervisor di bengkel BMJ memakai aplikasi ini setiap hari. Ketiga role sama pentingnya; tidak ada yang boleh jadi afterthought.

- Mekanik: absen, catat pekerjaan, ajukan kasbon.
- Kasir: cairkan kasbon, terima pekerjaan, catat transaksi toko.
- Supervisor: setujui/tolak kasbon, isi absen, hitung gaji, laporan, kelola karyawan.

Situasi: kerja operasional di bengkel, bukan browsing. HP dan laptop keduanya dipakai sesuai role.

## Product Purpose

BMJ Karyawan menggantikan Google Sheet “Aplikasi Karyawan” untuk kasbon, pekerjaan bengkel, absen, gaji, toko, dan laporan.

Sukses redesain ini: kerja harian selesai lebih cepat — lebih sedikit tap, lebih sedikit salah baca angka, lebih sedikit ragu sebelum bertindak.

Tidak ada daftar publik. Akun dibuat supervisor atau bootstrap pertama.

## Positioning

Satu workspace role-aware untuk uang dan kerja bengkel: integer rupiah, tanggal kalender, zona Asia/Jayapura, dan alur status yang sama dengan operasi nyata (kasbon cair baru jadi hutang). Spreadsheet bersama tidak bisa menegakkan itu.

## Operating Context

- Bahasa UI: Indonesia.
- Nama produk: BMJ Karyawan.
- Zona waktu: Asia/Jayapura. Tanggal `YYYY-MM-DD`. Uang integer IDR.
- Login email/kata sandi dan Google (akun harus sudah ada).
- Absen GPS di lokasi bengkel; supervisor bisa isi manual. Minggu tidak diisi.
- Impor dari spreadsheet sumber jika supervisor memintanya.

## Capabilities and Constraints

Fungsi yang ada dan tidak boleh diubah oleh redesain:

- Role `supervisor` | `kasir` | `mekanik` dan pembatasan aksesnya.
- Kasbon: pending → approved/rejected → disbursed → pembayaran → lunas.
- Pekerjaan: mekanik catat ongkos → diterima; lain proses → selesai → diterima; supervisor batal; bagi hasil ongkos/persenan.
- Gaji per bulan, potongan kasbon di slip.
- Toko: tunai, non tunai, panjar.
- Stack incumbent: TanStack Start (`apps/web`), tRPC, Better Auth, Drizzle/D1, shadcn di `packages/ui`, Tailwind v4.

Tidak diputuskan di sini: palet, tipografi, atau dunia visual — itu milik redesain.

## Brand Commitments

- Nama: BMJ Karyawan.
- Voice: Indonesia, operasional, langsung. Tidak marketing.
- Tidak ada logo file yang mengikat. Jangan ganti nama produk.

## Evidence on Hand

- App hidup di `apps/web`, port 3001.
- Copy halaman di `apps/web/src/lib/app-nav.ts`.
- Tidak ada testimoni, foto stok, atau studi kasus. Jangan mengarang pelanggan atau angka dummy sebagai bukti.

## Product Principles

1. Tiga role setara: setiap layar menghormati pekerjaan orang yang sedang login.
2. Kecepatan harian di atas ornament: aksi berikutnya harus kelihatan.
3. Angka dan status eksplisit: rupiah, tanggal, dan konsekuensi aksi tidak boleh hanya lewat warna.
4. Jangan sentuh aturan uang atau role demi tampilan.
5. Bahasa Indonesia, nama BMJ Karyawan, tetap.
