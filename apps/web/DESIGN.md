---
name: BMJ Karyawan
description: Aplikasi operasional bengkel di HP — aksen biru, kalender absen tetap.
colors:
  marker: "oklch(0.49 0.15 255)"
  wall: "oklch(0.965 0.012 250)"
  paper: "oklch(0.995 0.005 250)"
  ink: "oklch(0.23 0.04 260)"
  ink-soft: "oklch(0.46 0.03 250)"
  marker-ink: "oklch(0.99 0.01 250)"
typography:
  display:
    fontFamily: "Big Shoulders Display, Source Sans 3, sans-serif"
    fontSize: "clamp(4.5rem, 22vw, 6rem)"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Source Sans 3, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.1
  body:
    fontFamily: "Source Sans 3, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Source Sans 3, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.65rem"
    fontWeight: 600
    letterSpacing: "0.04em"
rounded:
  md: "0.375rem"
  lg: "0.75rem"
  xl: "1rem"
spacing:
  cell: "0.375rem"
  sheet: "1.5rem"
  page: "1.5rem"
components:
  button-primary:
    backgroundColor: "{colors.marker}"
    textColor: "{colors.marker-ink}"
    rounded: "{rounded.lg}"
    height: "3.5rem"
  button-outline:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    height: "3.5rem"
  today-cell:
    backgroundColor: "{colors.marker}"
    textColor: "{colors.marker-ink}"
    rounded: "{rounded.md}"
  week-cell:
    backgroundColor: "oklch(0.93 0.012 92)"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
---

# Design System: BMJ Karyawan

## Overview

**Creative North Star: "Kalender dinding bengkel"**

Hari ini mengisi layar seperti lembar kalender yang dipaku di dinding bengkel. Angka tanggal tidak bisa tidak dilihat. Aksi berikutnya adalah mencentang kotak, bukan membaca kartu metrik.

Dinding putih sedikit lebih gelap dari kertas sidebar, kertas gading, spidol biru hanya untuk hari ini dan tombol utama. Mekanik yang tidak mahir digital harus paham tanpa belajar menu.

**Key Characteristics:**
- Tanggal condensed raksasa, maksimum 6rem
- Satu aksen: spidol biru
- Hit target sebesar kotak kalender
- Tanpa kaca, tanpa grid 31 hari, tanpa kartu metrik sama ukuran

## Colors

Satu aksen di atas kertas dan dinding.

### Primary
- **Spidol merah** (`oklch(0.5 0.205 27)`): hari ini, tab aktif, tombol aksi. Jarang.

### Neutral
- **Dinding** (`oklch(0.955 0.01 92)`): canvas halaman, putih lebih gelap dari sidebar
- **Kertas** (`oklch(0.985 0.012 92)`): lembar kerja, form, chrome
- **Tinta** (`oklch(0.24 0.018 40)`): teks
- **Tinta lunak** (`oklch(0.42 0.02 40)`): sekunder, diwarnai dari tinta, bukan abu netral

### Named Rules
**The Marker Rule.** Merah hanya untuk hari ini dan aksi. Jangan mewarnai kartu, grafik, atau ikon dekoratif.

## Typography

**Display Font:** Big Shoulders Display (Source Sans 3 fallback)
**Body Font:** Source Sans 3

**Character:** Angka kalender sempit dan berat; tubuh tenang dan mudah dibaca.

### Hierarchy
- **Display** (800, clamp 4.5–6rem, lh 1): tanggal hari ini
- **Headline** (600, 1.5–2rem): nama hari
- **Title** (600, 1.125rem): judul bagian
- **Body** (400, 1rem): copy operasional
- **Label** (600, 0.65rem, uppercase): strip minggu

### Named Rules
**The Six-Rem Rule.** Display tidak lebih dari 6rem.

## Layout

Halaman adalah dinding. Lembar kertas di atasnya. Strip tujuh hari Senin–Minggu, bukan bulan penuh. Dasbor: tanggal, strip, satu tombol penuh, satu angka uang, antrian centang.

## Elevation & Depth

Bayangan kertas: offset + blur, bukan halo 0px.

### Shadow Vocabulary
- **Sheet** (`0 1px 2px oklch(0.24 0.018 40 / 0.08), 0 6px 16px -8px oklch(0.24 0.018 40 / 0.18)`): lembar kalender dan baris aksi

## Shapes

Kotak hari `rounded-md` (6px). Lembar `rounded-xl` (12px). Tombol aksi tinggi 56px. Bukan pil.

## Components

### Buttons
- **Primary:** spidol, tinggi 56px, teks kertas
- **Outline:** kertas di dinding
- **Focus:** cincin marker, offset 3px

### Cards / Containers
- Kertas di dinding, bayangan sheet, padding ~1.5–2rem

### Navigation
- Tab aktif = kotak hari terisi merah, bukan garis atas
- Sidebar item aktif sama

### Today sheet
- Angka tanggal, nama hari, strip 7, tombol satu tarikan

## Do's and Don'ts

### Do:
- **Do** biarkan tanggal mendominasi first viewport.
- **Do** pakai satu tombol merah untuk aksi berikutnya.
- **Do** tulis uang sebagai satu angka besar.

### Don't:
- **Don't** pakai deretan kartu metrik sama ukuran.
- **Don't** tampilkan grid 31 hari.
- **Don't** pakai sky blue, kaca, atau eyebrow di atas judul.
