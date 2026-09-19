# BMJ Karyawan — Redesign Brief

Dokumen ini adalah arahan implementasi untuk meredesain total antarmuka BMJ Karyawan. Tujuannya bukan mengganti warna atau memperbesar radius, tetapi membangun produk operasional yang terasa modern, elegan, cepat dipahami, dan nyaman dipakai setiap hari di bengkel.

## 1. Hasil yang diinginkan

BMJ Karyawan harus terasa seperti **workspace operasional yang tenang dan sigap**:

- **Modern:** struktur adaptif, navigasi jelas, feedback cepat, dan informasi mudah dipindai.
- **Elegan:** hierarki kuat, permukaan bersih, warna hemat, tipografi rapi, dan detail visual yang tidak berisik.
- **User-friendly:** aksi utama mudah ditemukan, formulir tidak mendominasi halaman, istilah konsisten, serta error selalu memberi jalan keluar.
- **Kontekstual:** mekanik, kasir, dan supervisor hanya melihat informasi serta tindakan yang relevan dengan perannya.
- **Terpercaya:** nominal, status, tanggal, dan konsekuensi aksi selalu eksplisit. Tidak ada state yang hanya dibedakan lewat warna.

North star:

> Saat membuka aplikasi, pengguna langsung tahu apa yang perlu diperhatikan, apa yang bisa dilakukan, dan apa yang sudah selesai—tanpa harus mempelajari antarmukanya.

## 2. Cara memakai brief ini

Sebelum mengubah kode:

1. Baca implementasi aktual dan pertahankan idiom proyek.
2. Baca skill `better-accessibility`, `better-layout`, `better-writing`, `better-typography`, `better-colors`, dan `better-ui`.
3. Inventaris komponen yang sudah ada sebelum membuat komponen baru.
4. Kerjakan fondasi dan app shell lebih dahulu, lalu halaman per halaman.
5. Verifikasi setiap state di browser nyata, bukan hanya dari source.

Repo:

```text
/Users/bbbadry/Downloads/BMJ/BMJ-KARYAWAN
```

Jangan commit atau push otomatis. Serahkan perubahan dalam working tree agar dapat ditinjau lebih dahulu.

## 3. Batasan produk dan teknis

Redesign tidak boleh mengubah aturan bisnis atau kontrak data.

Pertahankan:

- TanStack Start dan struktur `apps/web`.
- Shared UI di `packages/ui`.
- Tailwind CSS v4 dan token CSS `oklch()`.
- shadcn `base-lyra` dan Base UI dengan pola `render=`, bukan `asChild`.
- Lucide sebagai satu-satunya library ikon.
- tRPC, Drizzle, Better Auth, RBAC, schema, dan route path yang ada.
- Role `supervisor`, `kasir`, dan `mekanik` beserta seluruh pembatasan aksesnya.
- Perhitungan gaji, kasbon, pekerjaan, integer IDR, tanggal `YYYY-MM-DD`, dan zona waktu `Asia/Jayapura`.
- Pesan otorisasi backend yang menjadi kontrak, termasuk `Supervisor only` dan `Kasir or supervisor only`.

Jangan menambah dependency UI, font, ikon, chart, atau motion jika hasil yang sama dapat dibuat dengan stack yang sudah ada.

## 4. Masalah desain saat ini

Berdasarkan source saat brief ini ditulis, fondasi token dan aksesibilitas sudah cukup baik, tetapi pengalaman produknya masih memiliki masalah berikut:

1. Banyak halaman terasa seperti susunan kartu dan formulir yang seragam, sehingga prioritas informasi kurang terbaca.
2. Form input panjang selalu tampil di atas daftar. Pengguna harus melewati area input meski hanya ingin membaca atau menindaklanjuti data.
3. Dashboard berisi angka, tetapi belum menjawab pertanyaan “apa yang perlu saya kerjakan sekarang?”.
4. Desktop masih menggunakan pola navigasi bawah dan struktur mobile yang diperlebar, sehingga ruang besar tidak dimanfaatkan dengan baik.
5. Aksi operasional penting tersebar di dalam baris dan mudah tenggelam saat data bertambah.
6. Tampilan list mobile dan tabel desktop belum memiliki pola filter, pencarian, toolbar, dan detail yang benar-benar konsisten.
7. Radius besar pada hampir semua permukaan membuat halaman terasa terlalu lunak dan mengurangi perbedaan antara container, control, dan status.
8. Loading, error, kosong, sukses, disabled, dan konfirmasi perlu dirancang sebagai bagian dari alur, bukan state tambahan.

Redesign harus menyelesaikan akar masalah ini. Jangan berhenti pada retheme.

## 5. Konsep visual: Quiet Workshop

Gunakan arah visual **Quiet Workshop**: presisi alat kerja, bersih, ringan, dan hangat tanpa terlihat seperti aplikasi finansial generik atau marketing site.

Karakter visual:

- Canvas netral dingin dengan kontras lembut.
- Surface putih atau hampir putih untuk area kerja utama.
- Sky blue sebagai penanda aksi, fokus, tautan, dan pilihan aktif.
- Teks utama charcoal, bukan hitam murni.
- Sedikit shadow untuk elevation; border hanya untuk struktur dan state.
- Sudut membulat terukur, bukan semua elemen berbentuk pil atau kartu besar.
- Ikon sederhana, outline sebagai default, fill hanya saat aktif jika bentuknya tetap jelas.
- Tidak memakai gradient dekoratif, glow, glassmorphism berlebihan, ilustrasi stok, atau ornamen yang tidak membantu pekerjaan.

### Prinsip penggunaan warna

- Pertahankan identitas sky yang sudah ada. `--sky-500` adalah swatch identitas; solid action memakai langkah yang benar-benar lulus kontras.
- Sky hanya berarti **interaktif, terpilih, fokus, atau brand**. Jangan mewarnai semua angka dan semua kartu dengan sky.
- Netral adalah warna dominan antarmuka.
- Hijau hanya untuk keberhasilan atau selesai.
- Amber hanya untuk kondisi yang memang membutuhkan perhatian.
- Merah hanya untuk gagal, bahaya, penolakan, atau aksi destruktif.
- Informasi status selalu memakai kombinasi ikon, label, dan warna.
- Hanya satu aksi utama berwarna penuh pada satu konteks visual.
- Light mode menjadi default. `.dark` tetap didukung dengan token lengkap, bukan inversi mekanis.

Ukur pasangan warna yang benar-benar dirender. Target minimum:

- Teks normal: WCAG AA `4.5:1`.
- Teks besar dan komponen UI: `3:1` sesuai kriterianya.
- Focus ring: terlihat terhadap permukaan dan control yang bersebelahan.

Jangan menulis “kontras terlihat cukup”. Catat nilai hasil ukur.

### Radius, border, dan elevation

Gunakan skala yang membedakan fungsi:

- Control kecil: `10px`.
- Card dan panel: `16px`.
- Dialog atau sheet besar: `20px`.
- Badge/status: pill hanya karena bentuknya memang label ringkas.

Outer radius harus sama dengan inner radius ditambah padding. Hindari `rounded-[1.5rem]` sebagai default semua container.

Gunakan tiga level elevation:

1. Canvas: tanpa shadow.
2. Surface: border tipis atau shadow-border halus.
3. Floating: shadow sedikit lebih tegas untuk menu, dialog, dan sticky action.

Card statis tidak perlu naik saat hover. Hover elevation hanya untuk card yang benar-benar dapat diklik.

## 6. Tipografi dan density

Tetap gunakan `system-ui`. Keanggunan datang dari hierarki dan spacing, bukan penambahan font.

- Page title: `24–30px`, weight `650–700`, line-height sekitar `1.1`.
- Section title: `16–18px`, weight `600`.
- Body: `14–16px`, line-height `1.5–1.6`.
- Label/control: `14px`, weight `500–600`.
- Caption: `12–13px`, jangan lebih kecil dari `12px`.
- Input di mobile tetap `16px` agar Safari tidak melakukan zoom otomatis.
- Nominal, tanggal, persentase, counter, dan kolom tabel numerik memakai `tabular-nums`.
- Heading menggunakan `text-wrap: balance`; deskripsi ringkas menggunakan `text-wrap: pretty`.
- Nama, ID, dan catatan panjang boleh wrap. Jangan truncate bila nilai penuh tidak tersedia di tempat lain.

Gunakan sentence case untuk semua copy Indonesia. Hindari ALL CAPS kecuali singkatan resmi.

## 7. Spacing dan layout system

Gunakan basis spacing `4px`, dengan ritme utama:

- `4px`: koreksi optik.
- `8px`: hubungan sangat dekat, misalnya ikon dan label.
- `12px`: antar-control dalam satu kelompok.
- `16px`: padding control atau card compact.
- `24px`: pemisah subbagian.
- `32px`: pemisah section.
- `48px`: pemisah blok halaman besar.

Aturan utama:

- Jarak antarkelompok minimal dua kali jarak di dalam kelompok.
- Text dan control mengikuti satu alignment edge yang jelas.
- Gunakan logical properties (`ps`, `pe`, `ms`, `me`, `start`, `end`).
- Jangan memakai divider jika spacing sudah cukup menjelaskan pengelompokan.
- Konten utama maksimal sekitar `1280px`; teks/form lebih sempit agar mudah dibaca.
- Padding halaman: `16px` di mobile, `24px` di tablet, `32px` di desktop.
- Semua sticky/fixed chrome harus menghormati safe area.
- Tidak boleh ada scroll horizontal pada viewport `320px`, kecuali grid data yang memang memiliki pola navigasi horizontal yang terlihat jelas.

## 8. App shell yang adaptif

### Mobile

- Header compact dan sticky: judul halaman, optional contextual action, serta menu akun.
- Bottom navigation tetap menjadi navigasi utama dan selalu mengikuti role.
- Maksimal lima destination terlihat. Destination lain masuk ke “Lainnya” dengan indikator aktif yang benar.
- Tab aktif menggunakan sky, weight lebih kuat, serta shape indicator halus; jangan mengandalkan perubahan warna saja.
- Content mendapat padding bawah yang cukup agar tidak tertutup tab bar.

### Desktop

Pada lebar yang cukup untuk menampung konten, ubah shell menjadi:

- Sidebar kiri tetap dengan brand, seluruh navigasi yang diizinkan role, dan user menu di bagian bawah.
- Top bar konten berisi page title, description singkat bila dibutuhkan, dan aksi utama.
- Bottom navigation tidak ditampilkan.
- Sidebar dapat compact bila ruang terbatas, tetapi label tidak boleh hilang tanpa tooltip dan accessible name.
- Area utama memakai grid yang memanfaatkan ruang, bukan hanya membesarkan card mobile.

Breakpoint ditentukan saat layout tidak lagi muat, bukan karena nama perangkat. Uji terlebih dahulu di `320px`, sekitar `768px`, dan `1440px`, lalu sesuaikan titik patahnya.

### Page header

Setiap halaman terautentikasi menggunakan pola konsisten:

```text
Judul halaman                         [Aksi utama]
Deskripsi singkat / konteks periode   [Aksi sekunder]
```

Di mobile, judul tetap berada di header dan action dapat turun ke content atau sticky action bar jika diperlukan. Jangan menduplikasi `<h1>`.

## 9. Arsitektur interaksi

### Progressive disclosure

Daftar dan ringkasan adalah default. Form panjang dibuka saat pengguna memilih aksi.

- Mobile: gunakan dialog fullscreen atau bottom-aligned dialog yang aman terhadap keyboard dan safe area.
- Desktop: gunakan dialog atau side panel dengan lebar yang sesuai isi.
- Form edit tidak boleh disisipkan tiba-tiba di tengah list panjang.
- Setelah save, tutup form hanya ketika berhasil, tampilkan feedback, lalu pertahankan posisi pengguna pada daftar.

Gunakan komponen dialog yang sudah ada; jangan menambah library sheet hanya untuk pola visual ini.

### Filter dan pencarian

Semua halaman berdata mengikuti pola yang sama:

- Search bila jumlah/jenis data memang perlu dicari.
- Quick filter status dalam segmented control atau chips yang jelas sebagai control.
- Filter lanjutan dalam disclosure/dialog.
- Tampilkan jumlah hasil dan filter aktif.
- Sediakan `Hapus filter` saat hasil kosong karena filter.
- Filter tidak boleh menggeser primary action atau menghilangkan konteks halaman.

### Data list dan tabel

- Mobile memakai record card/list dengan urutan: identitas, nilai utama, metadata, status, aksi.
- Desktop memakai tabel untuk perbandingan banyak record.
- Header tabel sticky jika daftar panjang.
- Kolom numerik rata kanan dan memakai tabular numbers.
- Aksi umum boleh langsung terlihat; aksi jarang masuk overflow menu.
- Klik row hanya untuk membuka detail jika seluruh row memiliki affordance, keyboard support, dan accessible name yang jelas.
- Detail record dibuka di dialog/panel, bukan memperluas row dengan form besar.

### Form

- Label selalu terlihat; placeholder hanya contoh format.
- Field dikelompokkan berdasarkan keputusan pengguna, bukan bentuk data backend.
- Nominal memiliki prefix `Rp` yang tidak ikut diketik.
- Tanggal menggunakan format dan control yang konsisten.
- Helper text muncul sebelum kesalahan jika ada aturan yang perlu diketahui.
- Validasi utama dilakukan saat submit; focus dipindahkan ke field invalid pertama.
- Error tampil di samping field dan menjelaskan cara memperbaiki.
- Submit tetap memakai label aksi asli saat loading, ditambah spinner dan `aria-busy`.
- Tombol destruktif terpisah secara visual dari aksi simpan.

### Feedback

- Toast dipakai untuk hasil aksi global yang singkat.
- Error field tetap inline; jangan hanya mengandalkan toast.
- Update non-urgent diumumkan dengan live region polite.
- Error yang memblokir halaman menampilkan alasan singkat dan tombol `Coba lagi`.
- Jangan menghapus data optimistically jika konsekuensinya sulit dipulihkan.

## 10. Shared component yang perlu dibentuk

Utamakan konsistensi melalui shared component, bukan class string yang disalin ke semua route.

Komponen/pola yang disarankan:

- `AppShell`: sidebar desktop, top bar, dan bottom navigation mobile.
- `PageHeader`: title, description/context, primary dan secondary action.
- `SectionHeader`: title, count, dan local action.
- `MetricCard`: label, value, optional trend/context, tiga density.
- `ActionQueue`: pekerjaan yang perlu ditindak berdasarkan role.
- `FilterBar`: search, quick filter, advanced filter, result count.
- `RecordList` / `RecordCard`: struktur record mobile yang konsisten.
- `DataTableShell`: toolbar, overflow, empty, loading, dan pagination/summary bila ada.
- `StatusBadge`: semantic tone, ikon, dan label Indonesia.
- `FormDialog`: form responsive dengan footer action stabil.
- `DetailPanel`: detail record dan action kontekstual.
- `StatePanel`: empty, error, restricted, dan no-filter-result.
- `Skeleton`: mengikuti geometri layar akhir, bukan blok acak.

Jangan membuat abstraction sebelum ada minimal dua penggunaan nyata. Shared component tidak boleh menyembunyikan aturan domain.

## 11. Blueprint per halaman

### Login dan bootstrap supervisor

Tujuan: masuk ke aplikasi tanpa distraksi dan dengan rasa percaya.

- Mobile: form satu kolom, brand kecil, heading jelas, dan satu CTA utama.
- Desktop: layout dua area. Area brand memberi konteks singkat BMJ Karyawan; area form tetap sempit dan fokus.
- Jangan menggunakan hero marketing, testimonial, atau ilustrasi dekoratif.
- Google sign-in adalah aksi sekunder visual.
- Error autentikasi tenang dan actionable: jelaskan apakah pengguna perlu memeriksa email, kata sandi, atau koneksi.
- Bootstrap supervisor dibedakan dari login biasa dengan penjelasan bahwa ini setup pertama.

### Dasbor

Dasbor harus menjawab tiga hal: kondisi saat ini, pekerjaan berikutnya, dan jalan pintas.

Urutan konten:

1. Greeting singkat dan tanggal/periode aktif.
2. Satu blok ringkasan utama yang paling relevan dengan role.
3. `Perlu ditindak` berisi antrean nyata dan dapat diklik.
4. Ringkasan keuangan/operasional sekunder.
5. Aksi cepat yang sesuai role.

Role behavior:

- Mekanik: pekerjaan aktif, pekerjaan menunggu konfirmasi, sisa kasbon, slip gaji terbaru.
- Kasir: kasbon siap dicairkan, transaksi toko hari ini, pekerjaan yang perlu diselesaikan.
- Supervisor: kasbon menunggu persetujuan, pekerjaan/status bermasalah, ringkasan pendapatan dan pengeluaran, periode gaji yang perlu ditindak.

Jangan menampilkan enam kartu dengan bobot yang sama. Satu informasi harus dominan; sisanya mendukung.

### Kasbon

- Page header memiliki CTA `Ajukan kasbon`.
- Ringkasan menampilkan total, telah dibayar, dan sisa dengan label lengkap; jangan memakai `TTL`.
- Supervisor melihat antrean persetujuan sebagai section paling atas.
- Kasir melihat antrean pencairan sebagai section paling atas.
- Mekanik melihat pengajuan dan sisa miliknya lebih dahulu.
- Riwayat memiliki filter status dan periode yang konsisten.
- `Setujui` dan `Cairkan` boleh menjadi aksi langsung jika aman.
- `Tolak kasbon` wajib membuka konfirmasi dengan alasan, konsekuensi, `Tolak kasbon`, dan `Batal`.
- `Catat pembayaran` membuka form ringkas dengan sisa yang masih harus dibayar.
- Status UI: `Menunggu`, `Disetujui`, `Ditolak`, `Dicairkan`, `Lunas`.

### Pekerjaan

- CTA utama: `Catat pekerjaan`.
- Daftar dimulai dari pekerjaan yang masih membutuhkan aksi.
- Status dipahami sebagai alur, bukan label terpisah: dicatat → proses → selesai → dibayar/ditutup sesuai aturan domain yang ada.
- Quick filters memakai label Indonesia dan menampilkan count jika berguna.
- Card mobile menonjolkan jenis pekerjaan, mekanik, ongkos, tanggal, dan status.
- Desktop table mengutamakan kolom untuk pemindaian cepat; detail catatan dan struk masuk detail panel.
- Aksi perubahan status menggunakan verb yang menggambarkan hasil, bukan label generik `Ubah`.
- Preview struk memiliki outline netral, alt text sesuai fungsi, dan dapat dibuka lebih besar.

### Gaji

- Periode menjadi control compact di page header, bukan card besar yang mengambil satu section sendiri.
- Tampilkan status periode (`Draf` atau `Dikunci`) dekat selector periode.
- Supervisor melihat summary total payout dan action `Hitung ulang` / `Kunci gaji` sesuai state.
- Karyawan biasa melihat slip miliknya sebagai detail yang mudah dibaca, bukan tabel lebar.
- Mobile memakai summary take-home pay lebih dahulu, lalu breakdown berkelompok.
- Desktop memakai tabel untuk perbandingan dan detail panel untuk satu slip.
- `Kunci gaji` adalah aksi konsekuensial dan wajib memakai confirmation dialog yang menjelaskan dampaknya.

### Absen

- Periode bulan/tahun berada di header/filter bar.
- Desktop boleh memakai attendance grid dengan nama sticky dan header tanggal sticky.
- Mobile tidak boleh memaksa pengguna menavigasi tabel bulanan penuh. Tampilkan daftar karyawan atau minggu aktif, lalu buka editor kehadiran yang fokus.
- Setiap status menampilkan label/ikon yang dapat dipahami tanpa warna.
- Target sel minimal `44×44px` di touch.
- Perubahan kehadiran harus memiliki feedback langsung dan state saving yang jelas.
- Sediakan legend yang ringkas dan selalu terlihat ketika grid digunakan.

### Toko

- CTA utama: `Catat transaksi`.
- Summary memprioritaskan total hari ini, lalu Tunai, Non tunai, dan Panjar.
- Form transaksi dibuka on demand.
- Pilihan jenis pembayaran menggunakan control yang cepat dipindai, bukan dropdown jika opsinya hanya sedikit dan stabil.
- Riwayat menampilkan jenis, nominal, catatan, waktu/tanggal, dan nomor transaksi dalam hierarki yang jelas.
- Empty state mengarahkan pengguna ke `Catat transaksi`.

### Laporan

- Filter periode memakai preset yang berguna (`Bulan ini`, `Bulan lalu`, `Pilih tanggal`) tanpa mengubah kontrak tanggal backend.
- Setelah periode, tampilkan ringkasan pendapatan, pengeluaran, dan hasil bengkel.
- Laporan ongkos dan kumulatif memakai tabs atau section yang jelas, bukan dua kartu identik tanpa prioritas.
- Visualisasi sederhana boleh dibuat dengan CSS/SVG yang aksesibel bila benar-benar membantu perbandingan. Jangan tambah chart library.
- Tabel lengkap tetap menjadi sumber angka yang presisi.
- No-result state menyebut periode yang dipilih dan menawarkan `Ubah periode`.

### Karyawan

- Header memiliki `Tambah karyawan` sebagai primary action dan `Impor spreadsheet` sebagai secondary action.
- Daftar mendahului form. Jangan tampilkan form tambah panjang secara permanen.
- Sediakan search nama/email dan filter role/status.
- Mobile card menampilkan nama, role, status aktif, dan ringkasan kompensasi; detail sensitif tidak perlu memenuhi kartu.
- Desktop table menampilkan kolom yang benar-benar dibutuhkan untuk membandingkan karyawan.
- Edit dibuka dalam dialog/panel dan mempertahankan konteks row yang dipilih.
- Hasil impor diringkas dengan count sukses/gagal; detail error dapat di-expand dan mudah disalin.

## 12. Content design

Suara produk: operasional, tenang, langsung, dan manusiawi.

Aturan:

- Gunakan Bahasa Indonesia yang konsisten.
- Tombol dimulai dengan kata kerja: `Ajukan kasbon`, `Catat pekerjaan`, `Simpan perubahan`.
- Hindari `OK`, `Ya`, `Submit`, `Pending`, `TTL`, dan label teknis lain jika ada padanan yang jelas.
- Confirmation action mengulang akibat: `Tolak kasbon`, bukan `Ya`.
- Error menyebut cara pulih: `Tidak bisa menyimpan. Periksa koneksi, lalu coba lagi.`
- Empty state menjelaskan tempatnya, alasan kosong jika diketahui, lalu memberi satu next action.
- Label toggle menggambarkan kondisi ON, misalnya `Karyawan aktif`.
- Gunakan `pilih`, bukan campuran `klik` dan `tap`, agar copy cocok lintas perangkat.

Istilah utama yang tidak boleh berubah-ubah:

`Dasbor`, `Kasbon`, `Pekerjaan`, `Gaji`, `Absen`, `Toko`, `Laporan`, `Karyawan`.

## 13. Aksesibilitas wajib

- Satu `<main id="main">` dan satu `<h1>` per halaman.
- Skip link tetap menjadi elemen focusable pertama.
- Gunakan native `<button>`, `<a href>`, `<label>`, `<table>`, dan form semantics sebelum ARIA.
- Semua control mempunyai accessible name; icon-only button memakai `aria-label`.
- `:focus-visible` minimal setara perimeter solid `2px` dan terlihat di setiap surface.
- Seluruh flow dapat diselesaikan dengan keyboard. Escape menutup overlay, focus masuk ke overlay, dan kembali ke trigger ketika ditutup.
- Dialog membuat background tidak interaktif dan mencegah scroll leakage.
- Touch target target `44×44px`; desktop minimal `40×40px` saat density memungkinkan.
- Status, error, pilihan aktif, dan perubahan data tidak boleh disampaikan lewat warna atau motion saja.
- Toast error/action tidak hilang sebelum pengguna sempat membaca atau bertindak.
- Layout tetap bekerja pada zoom `200%` dan lebar `320px`.
- Jangan membatasi zoom melalui viewport meta.
- Reduced motion menghapus scale/slide dan mempertahankan feedback statis.
- Hover style hanya aktif pada perangkat yang memang mendukung hover.

## 14. Motion dan microinteraction

Motion harus memberi sebab-akibat, bukan dekorasi.

- Hover/focus/color: maksimal `150ms`.
- Curve utama: `cubic-bezier(0.2, 0, 0, 1)`.
- Button press boleh `scale(0.96)` dan hanya dengan `motion-safe`.
- Transisikan properti spesifik; jangan gunakan `transition-all`.
- Dialog/menu masuk dengan opacity dan perpindahan kecil. Exit lebih lembut dari enter.
- Jangan stagger list yang sering berubah atau dipakai berulang.
- Loading data memakai skeleton statis atau shimmer yang menghormati reduced motion.
- Jangan menganimasikan seluruh halaman saat load pertama.

## 15. State matrix

Setiap halaman dan shared component harus memiliki perilaku yang jelas untuk:

| State | Perilaku |
| --- | --- |
| Loading awal | Skeleton mengikuti struktur akhir dan mempertahankan layout. |
| Refresh | Data lama tetap terlihat bila aman; indikator refresh tidak menutup seluruh halaman. |
| Empty pertama | Jelaskan fungsi area dan tawarkan satu aksi utama. |
| Empty karena filter | Sebut filter/query dan tawarkan `Hapus filter`. |
| Error halaman | Jelaskan kegagalan singkat dan beri `Coba lagi`. |
| Error field | Tampil dekat field, dihubungkan dengan `aria-describedby`. |
| Saving | Control terkait disabled, label tetap, spinner terlihat, `aria-busy=true`. |
| Success | Update data terlihat dan toast singkat mengonfirmasi hasil. |
| Disabled | Alasan tersedia di dekat control; jangan mengandalkan opacity saja. |
| Restricted | Redirect sesuai aturan role; jangan bocorkan aksi yang tidak diizinkan. |
| Destructive | Treatment merah, konsekuensi eksplisit, confirmation atau undo. |

## 16. Urutan implementasi

### Fase 1 — Fondasi

1. Audit token, raw color, radius, shadow, spacing, typography, dan responsive behavior.
2. Rapikan semantic tokens light/dark tanpa mengubah arti status.
3. Bentuk `AppShell`, `PageHeader`, pola container, dan navigasi adaptif.
4. Rapikan Button, Card, Input, Select, Dialog, Badge, Table, Empty, dan Skeleton.
5. Bentuk shared patterns untuk filter, record list, detail, dan form dialog.

### Fase 2 — Alur utama

1. Login dan bootstrap supervisor.
2. Dasbor per role.
3. Kasbon end-to-end: ajukan, setujui, tolak, cairkan, bayar, filter.
4. Pekerjaan end-to-end: catat, filter, ubah status, lihat detail.

### Fase 3 — Operasional lanjutan

1. Gaji.
2. Absen.
3. Toko.
4. Laporan.
5. Karyawan dan impor.

Selesaikan satu flow beserta semua state sebelum berpindah. Jangan menyebar perubahan setengah jadi ke seluruh route.

## 17. Verifikasi

Jalankan setidaknya:

```bash
bun run check-types
bun run build
bun run dev
```

Catat bila script repo rusak atau tidak tersedia; jangan menyatakan lolos bila command tidak berjalan.

Uji visual dan interaksi:

- Viewport `320px`, `390px`, `768px`, dan `1440px`.
- Zoom browser `200%`.
- Light dan `.dark`.
- Keyboard-only dari login sampai flow utama setiap role.
- Screen-reader semantics untuk form, dialog, status, tabel, dan toast.
- `prefers-reduced-motion: reduce`.
- String panjang dan data kosong.
- Loading, refresh, server error, validasi field, saving, dan success.
- Safe area pada header dan bottom navigation.

Uji role:

- Mekanik tidak melihat Absen, Toko, Karyawan, atau Laporan.
- Kasir hanya melihat aksi yang diizinkan kasir.
- Supervisor melihat seluruh menu dan antrean tindak lanjut.
- Navigasi langsung ke route terlarang tetap mengikuti redirect/guard yang ada.

Uji flow minimum:

1. Login → Dasbor → navigasi role.
2. Ajukan kasbon → setujui/tolak → cairkan → catat pembayaran.
3. Catat pekerjaan → ubah status → filter → buka detail.
4. Pilih periode gaji → hitung ulang → konfirmasi kunci.
5. Ubah absen pada mobile dan desktop.
6. Catat transaksi toko dan periksa riwayat.
7. Ubah periode laporan dan tangani no-result.
8. Tambah/edit karyawan dan periksa hasil impor.

## 18. Definition of done

Redesign selesai hanya jika:

- Produk terasa sebagai satu sistem, bukan kumpulan komponen shadcn yang ditempel.
- Mobile dan desktop memiliki layout yang memang sesuai ruangnya.
- Dashboard memprioritaskan tindakan, bukan hanya menampilkan angka.
- Form panjang tidak lagi mendominasi daftar.
- Setiap role langsung melihat prioritas dan aksi yang relevan.
- Hanya ada satu primary action per konteks.
- Semua status memakai ikon/teks selain warna.
- Copy sepenuhnya konsisten dalam Bahasa Indonesia sentence case.
- Loading, empty, error, success, disabled, restricted, dan destructive state selesai.
- Focus, keyboard, zoom `200%`, reduced motion, dan lebar `320px` terverifikasi.
- Light dan dark mode memiliki kontras terukur.
- Tidak ada perubahan domain, kontrak API, role, route, schema, maupun perhitungan bisnis.
- Typecheck dan build lolos, atau kegagalan existing dilaporkan dengan bukti yang jelas.

Keberhasilan redesign diukur dari berkurangnya beban berpikir pengguna: lebih sedikit mencari, lebih sedikit scroll yang tidak perlu, lebih sedikit keraguan sebelum bertindak, dan lebih cepat menyelesaikan pekerjaan harian.
