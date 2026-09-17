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
