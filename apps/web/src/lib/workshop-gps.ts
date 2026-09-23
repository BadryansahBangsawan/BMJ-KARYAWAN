const CLOCK_PERM_KEY = "bmj-karyawan-clock-perm";

export function markClockPermissionGranted() {
  try {
    localStorage.setItem(CLOCK_PERM_KEY, "1");
  } catch {
    /* private mode */
  }
}

export function requestWorkshopPosition(): Promise<{ lat: number; lng: number }> {
  const { promise, resolve, reject } = Promise.withResolvers<{ lat: number; lng: number }>();
  if (!navigator.geolocation) {
    reject(new Error("GPS tidak tersedia di perangkat ini."));
    return promise;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      markClockPermissionGranted();
      resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    },
    (err) => {
      if (err.code === err.PERMISSION_DENIED) {
        reject(new Error("Izin GPS ditolak. Aktifkan lokasi di pengaturan browser."));
        return;
      }
      if (err.code === err.POSITION_UNAVAILABLE) {
        reject(new Error("Posisi GPS tidak dapat ditentukan. Coba di luar ruangan."));
        return;
      }
      reject(new Error("Permintaan GPS habis waktu. Coba lagi."));
    },
    { timeout: 15_000, maximumAge: 0, enableHighAccuracy: true },
  );
  return promise;
}

const MAX_PHOTO_CHARS = 50_000;
const MAX_EDGE = 320;

function jpegDataUrlFromCanvas(canvas: HTMLCanvasElement, maxChars = MAX_PHOTO_CHARS): string {
  for (const quality of [0.45, 0.35, 0.25, 0.18]) {
    const url = canvas.toDataURL("image/jpeg", quality);
    if (url.length <= maxChars) return url;
  }
  return canvas.toDataURL("image/jpeg", 0.12);
}

export async function jpegDataUrlFromFile(
  file: File,
  maxEdge = MAX_EDGE,
  maxChars = MAX_PHOTO_CHARS,
): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Kamera gagal memproses foto.");
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return jpegDataUrlFromCanvas(canvas, maxChars);
}

export async function jpegFileFromVideo(video: HTMLVideoElement): Promise<File> {
  const sourceW = video.videoWidth || MAX_EDGE;
  const sourceH = video.videoHeight || MAX_EDGE;
  const scale = Math.min(1, MAX_EDGE / Math.max(sourceW, sourceH));
  const width = Math.max(1, Math.round(sourceW * scale));
  const height = Math.max(1, Math.round(sourceH * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Kamera gagal mengambil foto.");
  ctx.drawImage(video, 0, 0, width, height);
  const url = jpegDataUrlFromCanvas(canvas);
  const res = await fetch(url);
  const blob = await res.blob();
  return new File([blob], "absen.jpg", { type: "image/jpeg" });
}

export async function captureClockProof(file: File): Promise<{
  photo: string;
  lat: number;
  lng: number;
}> {
  const photo = await jpegDataUrlFromFile(file);
  const pos = await requestWorkshopPosition();
  return { photo, lat: pos.lat, lng: pos.lng };
}
