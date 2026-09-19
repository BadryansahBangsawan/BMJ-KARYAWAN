# Prompt Redesign — BMJ Karyawan (3 Perbaikan)

Lakukan tiga perbaikan berikut secara bersamaan. Jangan ubah logika bisnis, query, atau mutasi yang sudah ada — hanya tampilan/UX.

---

## 1. Header — nama tertutup tombol (header.tsx + user-menu.tsx)

**Masalah:** Di header mobile, title halaman dan nama user berbagi satu baris sempit. Nama user di `UserMenu` di-truncate ke `max-w-40` sehingga terpotong, dan title halaman bisa ketutupan.

**Perbaikan `apps/web/src/components/header.tsx`:**
- Bungkus title dengan `truncate` tapi beri `min-w-0` dan `flex-1` supaya ia menyusut duluan.
- Tambahkan `shrink-0` pada `<UserMenu />` agar trigger-nya tidak pernah menyusut.
- Pastikan gap antara keduanya cukup (gap-3 sudah ada, pertahankan).

**Perbaikan `apps/web/src/components/user-menu.tsx`:**
- Pada `DropdownMenuTrigger`, ganti `max-w-40 truncate` dengan `max-w-[7.5rem] truncate` (lebih kecil, supaya title dapat lebih ruang di layar kecil).
- Di dalam `DropdownMenuContent`, tambahkan satu baris di bawah nama yang menampilkan peran (role) pengguna. Import `sessionRole` dan `roleLabel` dari `@/lib/session-role` dan tampilkan `roleLabel(sessionRole(session.user))` sebagai `DropdownMenuLabel` sekunder atau `DropdownMenuItem` non-klik dengan style `text-muted-foreground text-xs`.

---

## 2. Kasbon — hapus pilih diri sendiri, tampilkan nama + role dari sesi (kasbon.tsx)

**Masalah:** Saat role `mekanik` atau `kasir` mengajukan kasbon, form "Ajukan kasbon" tidak menampilkan siapa yang mengajukan — pengguna tidak tahu untuk siapa kasbon diajukan. Supervisor tetap perlu pilih karyawan (sudah benar).

**Perbaikan di `apps/web/src/routes/_auth/kasbon.tsx`:**

Pada `<FormDialog>` "Ajukan kasbon":
- **Hapus** field `employeeId` yang hanya muncul untuk `supervisor` tapi placeholder-nya bilang "Diri sendiri / pilih karyawan". Ubah placeholder menjadi "Pilih karyawan" saja.
- **Tambahkan** sebuah info/display read-only di **atas** field Keperluan (khusus `role !== "supervisor"`), yang menampilkan:
  ```
  Mengajukan atas nama:  [Nama pengguna]  ·  [Label peran]
  ```
  Implementasinya: sebuah `<div>` dengan `className="rounded-lg bg-muted/50 px-3 py-2 text-sm"` berisi:
  - `<span className="text-muted-foreground">Mengajukan atas nama</span>`
  - `<span className="font-medium">{session?.user.name}</span>`
  - `<span className="text-muted-foreground"> · {roleLabel(role)}</span>`

  Import `roleLabel` dari `@/lib/session-role` jika belum ada.

- Tidak ada perubahan pada payload `createMut` — backend sudah ambil employeeId dari session untuk non-supervisor.

---

## 3. Pekerjaan — foto struk + baca nomor struk & tanggal via AI (pekerjaan.tsx)

**Masalah:** Mekanik harus mengetik nomor struk dan tanggal secara manual. Seharusnya cukup foto struk, AI membaca nomor struk dan tanggal, lalu mekanik hanya input ongkos.

**Perbaikan di `apps/web/src/routes/_auth/pekerjaan.tsx`:**

### 3a. Ubah field Struk menjadi Camera/Upload + AI extraction

Ganti field `struk` yang `<Input type="text">` menjadi komponen inline (tidak perlu file terpisah) dengan dua mode:
1. **Tidak ada foto** → tampilkan tombol "Foto struk 📷" (`<label>` yang membungkus `<input type="file" accept="image/*" capture="environment" className="sr-only">`).
2. **Foto dipilih** → tampilkan preview thumbnail gambar kecil (max-height 80px, `object-fit: contain`) + tombol "Ganti" di sebelahnya.

Saat file dipilih (`onChange`):
1. Konversi ke base64 dengan `FileReader.readAsDataURL`.
2. Simpan base64 ke `field.handleChange(base64)` sehingga URL gambar itu yang dikirim sebagai nilai `struk`.
3. Jalankan ekstraksi AI: buat fungsi `async function extractStruk(base64: string)` yang memanggil backend endpoint (atau Cloudflare AI — **lihat poin 3c**). Fungsi ini mengembalikan `{ nomorStruk?: string; tanggal?: string }`.
4. Saat hasil kembali:
   - Jika ada `tanggal` (format YYYY-MM-DD), panggil `form.setFieldValue("workDate", tanggal)`.
   - Jika ada `nomorStruk`, simpan ke state lokal `const [strukturInfo, setStrukturInfo] = useState("")` dan tampilkan sebagai hint di bawah thumbnail.
   - Tampilkan spinner kecil (`animate-spin`) di sebelah tombol "Foto struk" selama ekstraksi berjalan (`const [extracting, setExtracting] = useState(false)`).

### 3b. Susun ulang urutan field di form (khusus role mekanik)

Untuk role `mekanik`, urutan field di `<FormDialog>` menjadi:
1. **Struk** (foto + AI extraction, paling atas — karena mekanik mulai dari foto)
2. **Tanggal** (otomatis terisi dari AI, tapi bisa diedit manual sebagai fallback)
3. **Uraian** (deskripsi pekerjaan)
4. **Ongkos** (input nominal)
5. **Ket / pelanggan** (opsional)
6. **Jenis** + Persen bengkel (tetap di bawah)

Untuk role `supervisor`, urutan tetap seperti sekarang (Mekanik → Tanggal → Uraian → … → Struk di bawah).

### 3c. Endpoint ekstraksi AI (pilihan implementasi)

Tambahkan fungsi `extractStruk` dalam file yang sama (bukan file terpisah) dengan menggunakan Cloudflare Workers AI melalui fetch ke endpoint yang sudah ada, atau langsung ke `@cf/llava-1.5-7b-hf` / `@cf/meta/llama-3.2-11b-vision-instruct`:

```ts
async function extractStruk(
  base64: string,
  signal?: AbortSignal,
): Promise<{ tanggal?: string; nomorStruk?: string }> {
  // Hapus prefix "data:image/jpeg;base64," dll
  const raw = base64.replace(/^data:image\/\w+;base64,/, "");
  try {
    const res = await fetch("/api/extract-struk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: raw }),
      signal,
    });
    if (!res.ok) return {};
    return await res.json();
  } catch {
    return {};
  }
}
```

Jika endpoint `/api/extract-struk` belum ada, buat juga file `apps/web/src/routes/api/extract-struk.ts` sebagai Cloudflare Worker dengan:
- Input: `{ image: string }` (base64 tanpa prefix)
- Panggil Cloudflare AI binding `env.AI.run("@cf/meta/llama-3.2-11b-vision-instruct", { messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: "data:image/jpeg;base64," + image } }, { type: "text", text: "Dari foto struk/nota ini, ekstrak: (1) nomor struk/nota jika ada, (2) tanggal nota dalam format YYYY-MM-DD. Jawab hanya JSON: {\"nomorStruk\": \"...\", \"tanggal\": \"YYYY-MM-DD\"}. Jika tidak ditemukan, omit field tersebut." }] }] })`
- Parse JSON dari respons text AI, return `{ nomorStruk?, tanggal? }`.

Kalau AI binding belum dikonfigurasi, cukup return `{}` (fungsi tetap ada tapi kosong) — flow foto tetap berjalan, hanya auto-fill-nya yang belum aktif. Jangan return error/throw.

---

## Hal yang TIDAK boleh diubah
- Logika query/mutasi (`trpc.*`) — tidak ada perubahan.
- Validasi Zod yang sudah ada.
- Role-based visibility (siapa bisa lihat apa).
- File selain yang disebut di atas (kecuali `api/extract-struk.ts` yang baru).
- Tipe `JobRow` dan `KasbonRow`.
- `PageShell`, `PageHeader`, komponen `ui/*`.

---

## Ringkasan file yang diubah
| File | Perubahan |
|------|-----------|
| `apps/web/src/components/header.tsx` | `shrink-0` pada UserMenu, truncate yang lebih baik |
| `apps/web/src/components/user-menu.tsx` | ukuran trigger lebih kecil, tampilkan role di dropdown |
| `apps/web/src/routes/_auth/kasbon.tsx` | info nama+role read-only untuk non-supervisor, hapus placeholder "diri sendiri" |
| `apps/web/src/routes/_auth/pekerjaan.tsx` | field struk jadi foto+AI, urutan field mekanik diubah |
| `apps/web/src/routes/api/extract-struk.ts` | *(baru)* endpoint AI baca struk |
