export function requestWorkshopPosition(): Promise<{ lat: number; lng: number }> {
  const { promise, resolve, reject } = Promise.withResolvers<{ lat: number; lng: number }>();
  if (!navigator.geolocation) {
    reject(new Error("GPS tidak tersedia di perangkat ini."));
    return promise;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
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

export async function jpegDataUrlFromFile(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const maxEdge = 720;
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
  return canvas.toDataURL("image/jpeg", 0.7);
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
