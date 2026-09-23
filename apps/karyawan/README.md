# Karyawan (Tauri 2)

Aplikasi native staf bengkel BMJ. Bukan website, bukan WebView ke `karyawan.badry.engineer`. UI React + Vite di dalam WebView Tauri; data lewat API produksi.

- Identifier: `engineer.badry.karyawan`
- Versi: 2.0.0
- Platform: macOS, Windows, Android. iOS tidak.

## Perintah

Dari folder ini, **bukan** dari root turbo:

```sh
bun run tauri dev
bun run tauri build
JAVA_HOME="$(/usr/libexec/java_home -v 21)" bun run tauri android init
JAVA_HOME="$(/usr/libexec/java_home -v 21)" bun run tauri android dev
JAVA_HOME="$(/usr/libexec/java_home -v 21)" bun run tauri android build --apk
```

Script `dev` / `build` / `check-types` sengaja tidak ada supaya `turbo run dev` di root tidak ikut.

Frontend saja: `bun run vite:dev` (port 1420).

JDK Android harus **21**, bukan Temurin 26:

```sh
export JAVA_HOME="/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
```

Keystore sideload tetap `~/.android/bmj-karyawan-release.jks` alias `bmj`. Salin `src-tauri/gen/android/key.properties.example` → `key.properties` (gitignored). Jangan commit `*.jks`, `*.apk`, `key.properties`.

Kalau `cargo` gagal `cc` exit 69: `sudo xcodebuild -license`.

Ikon dari `apps/web/public/icon-512.png`:

```sh
bunx tauri icon ../web/public/icon-512.png
```

## Izin native

Absen butuh kamera depan + GPS. Izin diminta sekali di OS, persist di pengaturan app.

- Android: `CAMERA`, `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`
- macOS: `NSCameraUsageDescription`, `NSLocationWhenInUseUsageDescription` di `src-tauri/Info.plist`

Kamera = `getUserMedia({ facingMode: "user" })` setelah izin native. GPS mobile = `@tauri-apps/plugin-geolocation`. Jangan hitung ulang gaji di klien.

APK Capacitor `apps/android` tetap sampai staf pindah. Jangan hapus.
