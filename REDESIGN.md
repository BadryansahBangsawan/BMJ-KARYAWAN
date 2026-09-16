# Prompt: redesain total BMJ Karyawan (skyblue)

Tempel seluruh isi di bawah garis ke sesi agent. Bukan skin token. Bukan audit.

---

# BMJ Karyawan — total visual redesign (skyblue)

Kamu meredesain total UI Aplikasi Karyawan BMJ. Hasilnya produk yang terasa baru, tetap aplikasi bengkel (kasbon, pekerjaan, absen, gaji, toko), bukan marketing site.

Baca skill `better-accessibility`, `better-layout`, `better-writing`, `better-typography`, `better-colors`, `better-ui`, dan `bmj-karyawan` sebelum edit. Terapkan nilainya persis. Jangan kira-kira.

Repo: `/Users/bbbadry/Downloads/BMJ/BMJ-KARYAWAN`. Setelah setiap perubahan: commit dan `git push origin main`.

## Non-tujuan

Jangan ubah: tRPC, Drizzle/schema, Better Auth, RBAC, rumus gaji/kasbon/pekerjaan, integer IDR, tanggal `YYYY-MM-DD`, TZ Asia/Jayapura, route path, role (`supervisor` | `kasir` | `mekanik`), pesan FORBIDDEN (`Supervisor only` / `Kasir or supervisor only`). Jangan ganti stack. Jangan tambah library font/motion/ikon kecuali yang sudah ada.

Idiom proyek: TanStack Start (`apps/web`, port 3001), shadcn `base-lyra` di `packages/ui` (Base UI `render=`, bukan `asChild`), Lucide, Tailwind v4 + `oklch()`, class `.dark`. Perbaikan ditulis dalam idiom ini.

## Recon (fakta sekarang)

- Token: `packages/ui/src/styles/globals.css`. `--primary` hampir hitam `oklch(0.205 0 0)`; `--accent` wash netral, bukan brand. Chart sudah biru.
- Root hardcode `<html lang="id" className="dark">` di `apps/web/src/routes/__root.tsx`. `theme-color` `#1c1c1c`.
- Chrome: header sticky blur (`apps/web/src/components/header.tsx`) + tab bar bawah (`tab-bar.tsx`), skip-link "Lewat ke konten", `lang="id"`.
- Font: `system-ui`. Radius `--radius: 0.625rem`. Button sudah `active:scale-[0.96]`, transisi `150ms` `cubic-bezier(0.2, 0, 0, 1)`, hit 44px mobile.
- Nav: semua Dasbor+Kasbon; mekanik +Pekerjaan+Gaji; kasir +Pekerjaan+Toko+Gaji; supervisor +Pekerjaan+Absen+Gaji+Laporan+Toko+Karyawan. Mekanik ke `/absen` `/toko` `/karyawan` `/laporan` → redirect `/dashboard`.
- Copy ID; label status kasbon masih English ALLCAPS (`PENDING` …). Empty states sudah ada di gaji/kasbon/pekerjaan/toko/karyawan/laporan.

## Warna — skyblue adalah brand

Satu hue brand: **sky** (Tailwind Sky, bukan CSS keyword `skyblue` `#87CEEB` — terlalu pucat untuk fill).

Pin identitas: **Sky 500 `#0ea5e9`**. Hitung ramp `oklch()` pakai library (`culori` / `colorjs.io`), jangan mata. Jangan hardcode hex campur oklch.

Sifat ramp (wajib):

- Langkah merata di perceived lightness, hue konstan (~230).
- Vividness puncak di tengah; ujung hampir netral.
- Lebih rapat di ujung terang (`50`–`200`).
- Ujung bukan pure white/black.

**Solid fill interaktif (`--primary`) bukan otomatis 500.** Sky 500 + teks putih sering gagal WCAG AA 4.5:1. Letakkan `#0ea5e9` di langkah identitas. `--primary` = langkah sky tergelap yang lulus AA untuk teks on-accent (biasanya ~Sky 600 `#0284c7`). Jangan diam-diam menggelapkan swatch identitas.

Dua tier:

- Primitive: `--sky-50` … `--sky-950`, `--neutral-50` … `--neutral-950`. Komponen **tidak** boleh pakai primitive.
- Semantik: tetap nama shadcn yang sudah ada (`--primary`, `--ring`, `--sidebar-primary`, …). Jangan parallel `--color-accent-*` yang bentrok. Di codebase ini `--primary` = brand solid. `--accent` tetap wash komponen (netral), **bukan** sky.

Netral: satu ramp, tint dingin ke hue sky, chroma kecil (terukur, tidak bisa dinamai). Langkah netral ≥ langkah sky.

Status — hue beda >15° dari sky:

- danger: merah yang sudah ada (~hue 27). Jangan sky.
- warning: amber, hanya jika UI benar-benar render peringatan.
- success: hijau, hanya jika UI benar-benar render sukses (lunas, diterima).
- Jangan ramp `info` sky — tabrakan makna dengan brand.
- Jangan generate status yang tidak diimpor.

Satu warna, satu makna: sky = interaktif / terpilih / brand. Teks statis, badge non-aksi, chart kategori jangan sky kecuali memang aksi/brand.

Satu aksi terisi per view: `Button variant="default"` (`bg-primary`) hanya untuk aksi utama. Peer = `outline` / `secondary` / `ghost`. Warna di background tombol, bukan di label netral.

Dark: bukan mirror mekanis. Turunkan vividness sky 1–2 langkah; longgarkan ujung gelap; ukur ulang setiap pasangan. Satu mekanisme: class `.dark` di seluruh token. Jangan campur `prefers-color-scheme` untuk token. Default **light** (hapus `className="dark"` di `__root.tsx`). Sediakan blok `.dark` lengkap. Jangan theme toggle kecuali diminta.

`--ring` dan tab aktif = sky. `--destructive` tetap bahaya. Chart 1–5 dari ramp sky + status, perceived lightness setara antar hue.

`theme-color` = solid fill sky (bukan `#1c1c1c`). `::selection` harus lulus kontras.

Ukur pasangan yang **ter-render** (termasuk header `bg-background/80` + blur). Gagal → ubah lightness, bukan hue. Target: WCAG AA (teks 4.5:1, UI 3:1) + APCA |Lc| 75 body, 60 label, 30 kontrol. Laporkan angka, jangan kira.

## Aksesibilitas

- Native dulu: `<button>` aksi, `<a href>` navigasi. Jangan `div onClick`.
- `:focus-visible` ring ≥2px; jangan `outline: none` tanpa ganti terukur. Ring sky harus kelihatan di setiap permukaan (termasuk primary button).
- Keyboard: Tab antar widget, Escape tutup overlay, panah di komposit. Modal: `inert` background, restore focus.
- Hit: 44×44 touch, 40×40 desktop; jangan overlap.
- Setiap kontrol punya nama. Icon-only: `aria-label`. Placeholder bukan label. Input mobile `font-size: 16px`.
- Status kasbon/pekerjaan/absen: warna + ikon + teks. Jangan warna saja.
- Motion di `@media (prefers-reduced-motion: no-preference)`. Reduced: opacity saja, tanpa scale/slide.
- Satu `<h1>` per halaman, heading tidak skip, satu `<main id="main">`. Skip-link tetap pertama.
- Lulus 320px dan zoom 200% tanpa scroll horizontal. `min-height` bukan `height` tetap pada teks.

## Layout

- Grup pakai ruang, bukan garis. Gap antar grup ≥ 2× gap dalam grup.
- Kontrol punya bentuk/border/zona; jangan menyerupai teks statis.
- Satu tepi alignment. Properti logis (`ps`/`pe`/`ms`/`me`), bukan `ml`/`pr`.
- Penting di atas + leading edge.
- Disclosure butuh cue. Peek 16–32px atau kontrol.
- Tombol full-width inset dari tepi (≥16px inline + safe area). Konten boleh bleed; kontrol mengambang di dalam margin.
- Tab bar + header: `env(safe-area-inset-*)`. Jangan clip aksi kritis.
- Breakpoint dari konten, bukan 768/1024. Test 320 dan lebar besar dulu.
- Teks tidak `width` tetap. Label pendek boleh wrap.

Chrome tetap: header sticky + tab bawah per role. Tab aktif: `currentColor` sky, stroke 2px + fill; inaktif stroke 1.5 outline. Jangan dua ikon library.

## Tipografi

- Tetap `system-ui` (alat padat, bukan editorial). Jangan font kedua.
- Skala kecil, nama semantik lewat utility yang ada (`text-xs` … `text-3xl`). Jangan size acak.
- Heading lebih ketat ~`leading-[1.1]`; body `1.5`–`1.6` unitless. Teks 3+ baris ≥ `1.4`.
- UI ≥400 di bawah 18px. Body ≥16px. Caption jarang <12px. Input 16px di mobile.
- IDR, tanggal, absen 100/50/0, counter: `tabular-nums`.
- Heading: `text-wrap: balance`. Deskripsi: `text-wrap: pretty`. ID/nama panjang: `break-word`. Badge: `nowrap`.
- Truncate hanya jika nilai penuh tetap terjangkau (tooltip/detail).
- `antialiased` di root saja (sudah ada).
- `lang="id"`. Selection tetap.

## Tulisan (id-ID)

Satu suara: operasional, tenang, sentence case. Tanpa English ALLCAPS di UI.

Kasbon: `Menunggu` / `Disetujui` / `Ditolak` / `Dicairkan` / `Lunas` — bukan `PENDING`.

Tombol verb-first: `Ajukan kasbon`, `Setujui`, `Cairkan`, `Tolak kasbon`, `Catat pekerjaan` — bukan `OK`/`Ya`.

Konfirmasi destruktif mengulang akibat: `Tolak kasbon` + `Batal`.

Error: cara memperbaiki, di samping field. Tanpa "oops", tanpa seru. `Tidak bisa menyimpan. Periksa koneksi, lalu coba lagi.`

Empty: apa tempat ini, cara mengisi, satu aksi. Jangan parkir info permanen di empty.

Placeholder = contoh format (`nama@bengkel.com`), bukan label.

Istilah tetap: Dasbor, Kasbon, Pekerjaan, Gaji, Absen, Toko, Laporan, Karyawan.

## UI polish

- Radius konsentris: outer = inner + padding. Token `--radius` 0.625rem; nested ikut rumus.
- Alignment optik: ikon+teks, padding ikon −2px.
- Depth: `--shadow-border` / hover untuk kartu & kontrol. Border hanya struktur/state (divider, input, selected).
- Transisi interruptible CSS; properti disebut eksplisit (`scale, opacity, background-color, box-shadow`). High-frequency ≤150ms. `cubic-bezier(0.2, 0, 0, 1)`.
- Press: `scale(0.96)` persis, `motion-safe`, `static` jika gerak mengganggu.
- Icon state: `currentColor`; outline default, fill = aktif. Satu stroke per set.
- Enter panggung jarang: stagger ~100ms. Exit lebih lembut, `translateY` kecil, `ease-out`.
- Gambar/avatar: outline 1px `oklch(0 0 0 / 0.1)` light / `oklch(1 0 0 / 0.1)` dark, bukan slate/sky.
- Theme switch (kalau ada): matikan transisi 1 frame.
- State change tidak boleh motion-only.

## Permukaan yang wajib selesai

Login + bootstrap supervisor; header; tab bar semua role; Dasbor; Kasbon (antrian, cairkan, filter, tolak); Pekerjaan; Gaji; Absen (sel 44px); Toko; Laporan; Karyawan. Plus loading, empty, error, 320px, dark class.

Hierarki Dasbor: angka uang + kerja hari ini di atas; sky hanya pada aksi/tautan/tab/fokus, bukan semua kartu.

## Urutan kerja

1. Inventory literal warna (hex/oklch/class). Collapse duplikat.
2. Tulis ramp sky + netral + status terpakai di `globals.css`; map semantik shadcn; ukur kontras light+dark.
3. Chrome: `__root` (default light, theme-color), header, tab, `AuthScreen`.
4. Komponen `packages/ui` yang memegang primary/ring/destructive — jangan pecah API `render=`.
5. Setiap route `_auth` + login: satu CTA terisi, status punya ikon+teks, empty/error, tabular IDR.
6. Copy status + tombol ke id-ID sentence case.
7. Verifikasi di browser sungguhan.

## Verifikasi (wajib, tulis hasilnya)

- Pasangan kontras terukur: primary-on-sky, body, muted, destructive, ring vs header blur — light dan dark. Angka, bukan "kelihatan ok".
- Keyboard: login → dasbor → kasbon approve/reject overlay → tab bar. Fokus terlihat tiap stop.
- 320px dan zoom 200%: tidak clip tab/CTA.
- `prefers-reduced-motion`: tidak ada scale/slide.
- Satu `bg-primary` per view.
- Mekanik tidak melihat Absen/Toko/Karyawan/Laporan.
- Smoke: `bun run dev` :3001, buka layar yang diubah.

## Definition of done

Bukan gelap-netral berprimary hitam. Sky hanya makna interaktif. Netral dingin. Status bukan sky. Light default + `.dark` lengkap. Copy id-ID. Kontras terukur. Domain tidak pecah.
