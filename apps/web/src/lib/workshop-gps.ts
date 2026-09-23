export type WorkshopPosition = {
  lat: number;
  lng: number;
  accuracyM: number;
};

const PRIME_TTL_MS = 90_000;
const GPS_WAIT_MS = 12_000;
const GPS_CACHE_MS = 60_000;
const GPS_QUICK_MS = 4_000;
/** Match packages/api CHECKIN_MAX_ACCURACY_M. */
const GPS_MAX_ACCURACY_M = 80;

type NativeGps = {
  requestPosition: (id: string) => void;
  cancel: () => void;
};

type NativePayload = {
  ok?: boolean;
  lat?: number;
  lng?: number;
  accuracyM?: number;
  code?: string;
  message?: string;
};

type GpsWindow = Window & {
  KaryawanGps?: NativeGps;
  __karyawanGpsDone?: (id: string, payload: NativePayload) => void;
};

let primedAt = 0;
let primedPos: WorkshopPosition | null = null;
let primePromise: Promise<WorkshopPosition> | null = null;
let waitTimer: ReturnType<typeof setTimeout> | null = null;
let gpsGen = 0;
let inflight: {
  resolve: (pos: WorkshopPosition) => void;
  reject: (error: Error) => void;
} | null = null;
let nativeHooked = false;

function gpsWindow(): GpsWindow | null {
  return typeof window === "undefined" ? null : (window as GpsWindow);
}

function nativeGps(): NativeGps | null {
  const g = gpsWindow()?.KaryawanGps;
  return g && typeof g.requestPosition === "function" ? g : null;
}

function abortError() {
  return Object.assign(new Error("GPS dibatalkan"), { name: "AbortError" });
}

function deniedError() {
  return Object.assign(new Error("Izin GPS ditolak. Aktifkan lokasi di pengaturan."), {
    name: "GpsPermissionDenied",
  });
}

function stopTimer() {
  if (waitTimer != null) {
    clearTimeout(waitTimer);
    waitTimer = null;
  }
}

function settleOk(pos: WorkshopPosition) {
  const pending = inflight;
  if (!pending) return;
  inflight = null;
  stopTimer();
  pending.resolve(pos);
}

function settleErr(error: Error) {
  const pending = inflight;
  if (!pending) return;
  inflight = null;
  stopTimer();
  try {
    nativeGps()?.cancel();
  } catch {
    /* ignore */
  }
  pending.reject(error);
}

function abortInflightGps() {
  gpsGen += 1;
  stopTimer();
  try {
    nativeGps()?.cancel();
  } catch {
    /* WebView may already be gone */
  }
  const pending = inflight;
  inflight = null;
  pending?.reject(abortError());
}

function hookNativeDone() {
  const win = gpsWindow();
  if (nativeHooked || !win) return;
  nativeHooked = true;
  win.__karyawanGpsDone = (id, payload) => {
    if (!inflight || id !== String(gpsGen)) return;
    if (payload?.ok === true) {
      const lat = Number(payload.lat);
      const lng = Number(payload.lng);
      const accuracyM = Number(payload.accuracyM);
      if (Number.isFinite(lat) && Number.isFinite(lng) && Number.isFinite(accuracyM) && accuracyM > 0) {
        settleOk({ lat, lng, accuracyM });
        return;
      }
      settleErr(new Error("GPS tidak akurat. Coba di luar ruangan."));
      return;
    }
    if (payload?.code === "abort") {
      settleErr(abortError());
      return;
    }
    if (payload?.code === "denied") {
      settleErr(deniedError());
      return;
    }
    settleErr(new Error(typeof payload?.message === "string" && payload.message ? payload.message : "GPS gagal."));
  };
}

function armWatchdog(gen: number, ms: number) {
  stopTimer();
  waitTimer = setTimeout(() => {
    if (gen !== gpsGen) return;
    settleErr(new Error("Permintaan GPS habis waktu. Coba lagi."));
  }, ms);
}

function isGeoDenied(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as GeolocationPositionError).code === 1;
}

function fromCoords(pos: GeolocationPosition): WorkshopPosition {
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracyM: pos.coords.accuracy,
  };
}

function goodFix(pos: WorkshopPosition) {
  return pos.accuracyM > 0 && pos.accuracyM <= GPS_MAX_ACCURACY_M;
}

function getCurrentPosition(options: PositionOptions) {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

async function requestWebPosition(gen: number) {
  if (!navigator.geolocation) {
    settleErr(new Error("GPS tidak tersedia di perangkat ini."));
    return;
  }

  // One request at a time. Android WebView often ignores the W3C timeout, so
  // two overlapping getCurrentPosition calls can hang with no callbacks.
  try {
    const cached = await getCurrentPosition({
      enableHighAccuracy: false,
      maximumAge: GPS_CACHE_MS,
      timeout: GPS_QUICK_MS,
    });
    if (gen !== gpsGen || !inflight) return;
    const pos = fromCoords(cached);
    if (goodFix(pos)) {
      settleOk(pos);
      return;
    }
  } catch (error) {
    if (gen !== gpsGen || !inflight) return;
    if (isGeoDenied(error)) {
      settleErr(deniedError());
      return;
    }
  }

  if (gen !== gpsGen || !inflight) return;

  try {
    const fine = await getCurrentPosition({
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: GPS_WAIT_MS,
    });
    if (gen !== gpsGen || !inflight) return;
    const pos = fromCoords(fine);
    if (goodFix(pos)) {
      settleOk(pos);
      return;
    }
    settleErr(new Error("GPS tidak akurat. Coba di luar ruangan."));
  } catch (error) {
    if (gen !== gpsGen || !inflight) return;
    if (isGeoDenied(error)) {
      settleErr(deniedError());
      return;
    }
    settleErr(new Error("Permintaan GPS habis waktu. Coba lagi."));
  }
}

function requestNativePosition(gen: number) {
  hookNativeDone();
  const gps = nativeGps();
  if (!gps) {
    settleErr(new Error("GPS native tidak tersedia."));
    return;
  }
  try {
    gps.requestPosition(String(gen));
  } catch {
    settleErr(new Error("GPS native gagal."));
  }
}

export function requestWorkshopPosition(): Promise<WorkshopPosition> {
  abortInflightGps();
  const { promise, resolve, reject } = Promise.withResolvers<WorkshopPosition>();
  const gen = ++gpsGen;
  inflight = { resolve, reject };
  const native = nativeGps();
  armWatchdog(gen, native ? GPS_WAIT_MS + 2_000 : GPS_WAIT_MS);
  if (native) requestNativePosition(gen);
  else void requestWebPosition(gen);
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
    stopTimer();
    try {
      nativeGps()?.cancel();
    } catch {
      /* ignore */
    }
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
  stopTimer();
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
