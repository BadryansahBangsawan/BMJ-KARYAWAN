export type WorkshopPosition = {
  lat: number;
  lng: number;
  accuracyM: number;
};

const PRIME_TTL_MS = 90_000;
const GPS_WAIT_MS = 20_000;
const GPS_CACHE_MS = 60_000;
const GPS_QUICK_MS = 4_000;
const GPS_IMPROVE_MS = 8_000;
/** Match packages/api CHECKIN_MAX_ACCURACY_M. */
const GPS_MAX_ACCURACY_M = 80;

let primedAt = 0;
let primedPos: WorkshopPosition | null = null;
let primePromise: Promise<WorkshopPosition> | null = null;
let watchId: number | null = null;
let waitTimer: ReturnType<typeof setTimeout> | null = null;
let gpsGen = 0;
let inflight: {
  resolve: (pos: WorkshopPosition) => void;
  reject: (error: Error) => void;
} | null = null;

function stopGpsWatch() {
  if (watchId != null) {
    navigator.geolocation?.clearWatch(watchId);
    watchId = null;
  }
  if (waitTimer != null) {
    clearTimeout(waitTimer);
    waitTimer = null;
  }
}

function abortInflightGps() {
  gpsGen += 1;
  stopGpsWatch();
  const pending = inflight;
  inflight = null;
  pending?.reject(Object.assign(new Error("GPS dibatalkan"), { name: "AbortError" }));
}

export function requestWorkshopPosition(): Promise<WorkshopPosition> {
  const { promise, resolve, reject } = Promise.withResolvers<WorkshopPosition>();
  if (!navigator.geolocation) {
    reject(new Error("GPS tidak tersedia di perangkat ini."));
    return promise;
  }

  abortInflightGps();
  const gen = ++gpsGen;
  inflight = { resolve, reject };
  let best: WorkshopPosition | null = null;

  const finish = (pos: WorkshopPosition) => {
    if (gen !== gpsGen || !inflight) return;
    inflight = null;
    stopGpsWatch();
    resolve(pos);
  };

  const fail = (error: Error) => {
    if (gen !== gpsGen || !inflight) return;
    inflight = null;
    stopGpsWatch();
    reject(error);
  };

  const consider = (pos: GeolocationPosition) => {
    if (gen !== gpsGen) return;
    const next: WorkshopPosition = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracyM: pos.coords.accuracy,
    };
    if (!best || next.accuracyM < best.accuracyM) best = next;
    if (next.accuracyM > 0 && next.accuracyM <= GPS_MAX_ACCURACY_M) finish(next);
  };

  const onDenied = (err: GeolocationPositionError) => {
    if (err.code === err.PERMISSION_DENIED) {
      fail(Object.assign(new Error("Izin GPS ditolak. Aktifkan lokasi di pengaturan."), { name: "GpsPermissionDenied" }));
    }
  };

  navigator.geolocation.getCurrentPosition(consider, onDenied, {
    enableHighAccuracy: false,
    maximumAge: GPS_CACHE_MS,
    timeout: GPS_QUICK_MS,
  });

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      consider(pos);
      if (gen !== gpsGen || !inflight || !best) return;
      if (best.accuracyM <= GPS_MAX_ACCURACY_M) return;
      watchId = navigator.geolocation.watchPosition(consider, onDenied, {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: GPS_IMPROVE_MS,
      });
    },
    onDenied,
    { enableHighAccuracy: true, maximumAge: GPS_CACHE_MS, timeout: GPS_WAIT_MS },
  );

  waitTimer = setTimeout(() => {
    if (best && best.accuracyM > 0 && best.accuracyM <= GPS_MAX_ACCURACY_M) {
      finish(best);
      return;
    }
    if (best) {
      fail(new Error("GPS tidak akurat. Coba di luar ruangan."));
      return;
    }
    fail(new Error("Permintaan GPS habis waktu. Coba lagi."));
  }, GPS_WAIT_MS);

  return promise;
}

function freshPrimed(): WorkshopPosition | null {
  if (primedPos && Date.now() - primedAt < PRIME_TTL_MS) return primedPos;
  return null;
}

/** Start GPS in the same tap as the camera so the OS dialogs fire once together. */
export function primeWorkshopPosition(): Promise<WorkshopPosition> {
  const cached = freshPrimed();
  if (cached) return Promise.resolve(cached);
  if (primePromise && inflight) return primePromise;
  primePromise = requestWorkshopPosition().then(
    (pos) => {
      primedPos = pos;
      primedAt = Date.now();
      return pos;
    },
    (error: unknown) => {
      primePromise = null;
      throw error;
    },
  );
  return primePromise;
}

/** Drop an in-flight watch. Keep a fresh fix so snap can still submit. */
export function abandonWorkshopPosition() {
  if (primedPos && Date.now() - primedAt < PRIME_TTL_MS) {
    gpsGen += 1;
    stopGpsWatch();
    inflight = null;
    return;
  }
  abortInflightGps();
  primedPos = null;
  primedAt = 0;
  primePromise = null;
}

async function readWorkshopPosition(): Promise<WorkshopPosition> {
  const cached = freshPrimed();
  if (cached) return cached;
  if (primePromise && inflight) return primePromise;
  return requestWorkshopPosition();
}

function clearPrimedPosition() {
  stopGpsWatch();
  inflight = null;
  primedPos = null;
  primedAt = 0;
  primePromise = null;
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
  accuracyM: number;
}> {
  const photo = await jpegDataUrlFromFile(file);
  try {
    const pos = await readWorkshopPosition();
    return { photo, lat: pos.lat, lng: pos.lng, accuracyM: pos.accuracyM };
  } finally {
    clearPrimedPosition();
  }
}
