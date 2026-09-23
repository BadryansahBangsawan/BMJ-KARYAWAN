package engineer.badry.karyawan;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.IntentSender;
import android.content.pm.PackageManager;
import android.location.Criteria;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.webkit.JavascriptInterface;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.common.api.ResolvableApiException;
import com.google.android.gms.location.CurrentLocationRequest;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.LocationSettingsRequest;
import com.google.android.gms.location.Priority;
import com.google.android.gms.tasks.CancellationTokenSource;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.concurrent.Executor;
import org.json.JSONObject;

/**
 * Native location for the remote-URL WebView. Chrome absen works because it
 * uses Play Services fused location (Wi‑Fi/cell, works indoors). Never gate on
 * Play Services "SUCCESS" — try fused and LocationManager together. Do not stop
 * updates except on destroy (camera / OEM onStop / permission dialogs). The
 * site talks to {@code window.KaryawanGps} because Capacitor plugins are not
 * injected into https://karyawan.badry.engineer.
 */
@CapacitorPlugin(name = "KaryawanGps")
public class KaryawanGps extends Plugin {

    static final int REQ_BOOT = 2401;
    static final int REQ_GPS = 2402;
    static final int REQ_SETTINGS = 2403;
    static final String VERSION = "1.6";
    private static final int MAX_ACCURACY_M = 80;
    private static final long LAST_KNOWN_MAX_AGE_MS = 90_000;
    private static final long STALE_LAST_KNOWN_MS = 300_000;
    private static final long WAIT_MS = 20_000;

    private static KaryawanGps installed;

    private final Handler main = new Handler(Looper.getMainLooper());
    private final Executor mainExecutor = command -> {
        if (Looper.myLooper() == main.getLooper()) command.run();
        else main.post(command);
    };
    private final LocationListener managerListener = new LocationListener() {
        @Override
        public void onLocationChanged(Location location) {
            consider(location);
        }

        @Override
        public void onProviderEnabled(String provider) {}

        @Override
        public void onProviderDisabled(String provider) {}

        @Deprecated
        @Override
        public void onStatusChanged(String provider, int status, Bundle extras) {}
    };
    private final LocationCallback gmsCallback = new LocationCallback() {
        @Override
        public void onLocationResult(LocationResult result) {
            if (result == null) return;
            Location last = result.getLastLocation();
            if (last != null) consider(last);
            for (Location loc : result.getLocations()) consider(loc);
        }
    };

    private LocationManager lm;
    private FusedLocationProviderClient fused;
    private CancellationTokenSource gmsCancel;
    private String pendingId;
    private Location best;
    private volatile Location warmFix;
    private int gen;
    private boolean gmsWarmOn;
    private boolean lmWarmOn;
    private boolean settingsAsked;
    private Runnable timeout;

    static boolean onActivityPermissionResult(int requestCode, int[] grantResults) {
        KaryawanGps gps = installed;
        if (gps == null) return false;
        if (requestCode == REQ_GPS) {
            gps.main.post(() -> gps.onGpsPermission(grantResults));
            return true;
        }
        if (requestCode == REQ_BOOT) {
            gps.main.post(gps::startWarm);
            return false;
        }
        return false;
    }

    static void onSettingsResult(int requestCode, int resultCode) {
        if (requestCode != REQ_SETTINGS) return;
        KaryawanGps gps = installed;
        if (gps == null) return;
        gps.main.post(() -> {
            gps.startWarm();
            if (gps.pendingId != null) gps.locate(gps.gen);
        });
    }

    @Override
    public void load() {
        installed = this;
        getBridge().getWebView().addJavascriptInterface(this, "KaryawanGps");
    }

    @Override
    protected void handleOnStart() {
        main.post(this::startWarm);
        super.handleOnStart();
    }

    @Override
    protected void handleOnResume() {
        main.post(this::startWarm);
        super.handleOnResume();
    }

    @Override
    protected void handleOnDestroy() {
        main.post(() -> {
            stopAbsenWait();
            stopWarm();
        });
        if (installed == this) installed = null;
        super.handleOnDestroy();
    }

    @JavascriptInterface
    public String version() {
        return VERSION;
    }

    @JavascriptInterface
    public String lastFix() {
        Location loc = warmFix;
        if (!usable(loc, LAST_KNOWN_MAX_AGE_MS)) return "";
        try {
            return toJson(loc).toString();
        } catch (Exception ignored) {
            return "";
        }
    }

    @JavascriptInterface
    public void requestPosition(String id) {
        main.post(() -> start(id));
    }

    @JavascriptInterface
    public void cancel() {
        main.post(() -> abort("abort", "GPS dibatalkan"));
    }

    private void start(String id) {
        if (id == null || !id.matches("[A-Za-z0-9_-]{1,40}")) {
            fail(id == null ? "" : id, "timeout", tagged("Tidak dapat membaca GPS. Coba lagi."));
            return;
        }
        stopAbsenWait();
        pendingId = id;
        best = null;
        int myGen = ++gen;

        Activity activity = getActivity();
        if (activity == null || activity.isFinishing()) {
            fail(id, "timeout", tagged("Tidak dapat membaca GPS. Coba lagi."));
            return;
        }
        if (!hasLocationPermission()) {
            ActivityCompat.requestPermissions(
                activity,
                new String[] { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION },
                REQ_GPS
            );
            return;
        }
        if (usable(warmFix, LAST_KNOWN_MAX_AGE_MS)) {
            succeed(warmFix);
            return;
        }
        locate(myGen);
    }

    private void onGpsPermission(int[] grantResults) {
        if (pendingId == null) {
            startWarm();
            return;
        }
        if (!granted(grantResults) || !hasLocationPermission()) {
            fail(
                pendingId,
                "denied",
                tagged("Izin lokasi app belum aktif. Pengaturan → Aplikasi → Karyawan → Izin → Lokasi.")
            );
            return;
        }
        startWarm();
        if (usable(warmFix, LAST_KNOWN_MAX_AGE_MS)) {
            succeed(warmFix);
            return;
        }
        locate(gen);
    }

    @SuppressLint("MissingPermission")
    private void locate(int myGen) {
        if (myGen != gen || pendingId == null) return;

        timeout = () -> {
            if (myGen != gen) return;
            if (best != null && accurate(best)) {
                succeed(best);
                return;
            }
            if (usable(warmFix, STALE_LAST_KNOWN_MS)) {
                succeed(warmFix);
                return;
            }
            Location stale = bestManagerKnown(STALE_LAST_KNOWN_MS);
            if (stale != null) {
                succeed(stale);
                return;
            }
            Location sample = best != null ? best : warmFix;
            if (sample != null && sample.hasAccuracy()) {
                String where = hasFinePermission()
                    ? "GPS tidak akurat (" + Math.round(sample.getAccuracy()) + " m). Coba di luar ruangan."
                    : "Izin lokasi app belum akurat (" +
                    Math.round(sample.getAccuracy()) +
                    " m). Pengaturan → Aplikasi → Karyawan → Izin → Lokasi → Gunakan lokasi tepat.";
                fail(pendingId, "inaccurate", tagged(where));
                return;
            }
            fail(pendingId, "timeout", tagged("Tidak dapat membaca GPS. Coba lagi."));
        };
        main.postDelayed(timeout, WAIT_MS);

        startWarm();
        startGmsOnce();
        startManagerOnce();
    }

    @SuppressLint("MissingPermission")
    private void startWarm() {
        if (!hasLocationPermission()) return;
        Activity activity = getActivity();
        if (activity == null || activity.isFinishing()) return;
        startGmsWarm();
        startManagerWarm();
    }

    @SuppressLint("MissingPermission")
    private void startGmsWarm() {
        FusedLocationProviderClient client = fusedClient();
        if (client == null || !hasLocationPermission()) return;
        pullGmsLast(client);
        ensureLocationSettings();
        if (gmsWarmOn) return;
        boolean ok = false;
        if (requestGmsUpdates(client, Priority.PRIORITY_HIGH_ACCURACY, 1000)) ok = true;
        if (requestGmsUpdates(client, Priority.PRIORITY_BALANCED_POWER_ACCURACY, 2000)) ok = true;
        if (requestGmsUpdates(client, Priority.PRIORITY_PASSIVE, 3000)) ok = true;
        gmsWarmOn = ok;
    }

    @SuppressLint("MissingPermission")
    private void pullGmsLast(FusedLocationProviderClient client) {
        try {
            client
                .getLastLocation()
                .addOnSuccessListener(mainExecutor, loc -> {
                    if (loc != null) consider(loc);
                })
                .addOnFailureListener(mainExecutor, e -> {});
        } catch (Exception ignored) {}
    }

    @SuppressLint("MissingPermission")
    private boolean requestGmsUpdates(FusedLocationProviderClient client, int priority, long intervalMs) {
        long minInterval = Math.max(250, intervalMs / 4);
        try {
            LocationRequest req = new LocationRequest.Builder(priority, intervalMs)
                .setMinUpdateIntervalMillis(minInterval)
                .setWaitForAccurateLocation(false)
                .build();
            client.requestLocationUpdates(req, gmsCallback, Looper.getMainLooper());
            return true;
        } catch (Exception ignored) {}
        try {
            LocationRequest req = legacyRequest(priority, intervalMs, minInterval);
            if (req == null) return false;
            client.requestLocationUpdates(req, gmsCallback, Looper.getMainLooper());
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    @SuppressWarnings("deprecation")
    private static LocationRequest legacyRequest(int priority, long intervalMs, long minInterval) {
        try {
            LocationRequest req = LocationRequest.create();
            req.setPriority(priority);
            req.setInterval(intervalMs);
            req.setFastestInterval(minInterval);
            return req;
        } catch (Exception ignored) {
            return null;
        }
    }

    private void ensureLocationSettings() {
        if (settingsAsked) return;
        Activity activity = getActivity();
        if (activity == null || activity.isFinishing()) return;
        settingsAsked = true;
        try {
            LocationRequest high = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 1000)
                .setWaitForAccurateLocation(false)
                .build();
            LocationSettingsRequest req = new LocationSettingsRequest.Builder()
                .addLocationRequest(high)
                .setAlwaysShow(true)
                .build();
            LocationServices.getSettingsClient(activity.getApplicationContext())
                .checkLocationSettings(req)
                .addOnFailureListener(mainExecutor, e -> {
                    if (!(e instanceof ResolvableApiException)) return;
                    Activity current = getActivity();
                    if (current == null || current.isFinishing()) return;
                    try {
                        ((ResolvableApiException) e).startResolutionForResult(current, REQ_SETTINGS);
                    } catch (IntentSender.SendIntentException ignored) {}
                });
        } catch (Exception ignored) {
            try {
                LocationRequest high = legacyRequest(Priority.PRIORITY_HIGH_ACCURACY, 1000, 250);
                if (high == null) return;
                LocationSettingsRequest req = new LocationSettingsRequest.Builder()
                    .addLocationRequest(high)
                    .setAlwaysShow(true)
                    .build();
                Activity current = getActivity();
                if (current == null) return;
                LocationServices.getSettingsClient(current.getApplicationContext())
                    .checkLocationSettings(req)
                    .addOnFailureListener(mainExecutor, e -> {
                        if (!(e instanceof ResolvableApiException)) return;
                        Activity act = getActivity();
                        if (act == null || act.isFinishing()) return;
                        try {
                            ((ResolvableApiException) e).startResolutionForResult(act, REQ_SETTINGS);
                        } catch (IntentSender.SendIntentException ignored2) {}
                    });
            } catch (Exception ignored2) {}
        }
    }

    @SuppressLint("MissingPermission")
    private void startManagerWarm() {
        if (lmWarmOn) return;
        Activity activity = getActivity();
        if (activity == null) return;
        lm = (LocationManager) activity.getSystemService(Activity.LOCATION_SERVICE);
        if (lm == null) return;
        lmWarmOn = true;
        try {
            Criteria coarse = new Criteria();
            coarse.setAccuracy(Criteria.ACCURACY_COARSE);
            coarse.setCostAllowed(true);
            lm.requestLocationUpdates(1000, 0, coarse, managerListener, Looper.getMainLooper());
        } catch (SecurityException | IllegalArgumentException | IllegalStateException ignored) {}
        try {
            Criteria fine = new Criteria();
            fine.setAccuracy(Criteria.ACCURACY_FINE);
            fine.setCostAllowed(true);
            lm.requestLocationUpdates(1000, 0, fine, managerListener, Looper.getMainLooper());
        } catch (SecurityException | IllegalArgumentException | IllegalStateException ignored) {}
        for (String provider : managerProviders()) {
            try {
                lm.requestLocationUpdates(provider, 1000, 0, managerListener, Looper.getMainLooper());
            } catch (SecurityException | IllegalArgumentException | IllegalStateException ignored) {}
        }
    }

    private void stopWarm() {
        gmsWarmOn = false;
        lmWarmOn = false;
        if (fused != null) {
            try {
                fused.removeLocationUpdates(gmsCallback);
            } catch (Exception ignored) {}
        }
        if (lm != null) {
            try {
                lm.removeUpdates(managerListener);
            } catch (SecurityException | IllegalArgumentException ignored) {}
        }
    }

    @SuppressLint("MissingPermission")
    private void startGmsOnce() {
        FusedLocationProviderClient client = fusedClient();
        if (client == null || !hasLocationPermission()) return;
        if (gmsCancel != null) {
            try {
                gmsCancel.cancel();
            } catch (Exception ignored) {}
        }
        gmsCancel = new CancellationTokenSource();
        pullGmsLast(client);
        try {
            client
                .getLastLocation()
                .addOnSuccessListener(mainExecutor, loc -> {
                    if (pendingId == null || loc == null) return;
                    if (usable(loc, LAST_KNOWN_MAX_AGE_MS)) {
                        succeed(loc);
                        return;
                    }
                    consider(loc);
                })
                .addOnFailureListener(mainExecutor, e -> {});
        } catch (Exception ignored) {}
        pullGmsCurrent(client, Priority.PRIORITY_BALANCED_POWER_ACCURACY);
        pullGmsCurrent(client, Priority.PRIORITY_HIGH_ACCURACY);
        try {
            CurrentLocationRequest balanced = new CurrentLocationRequest.Builder()
                .setPriority(Priority.PRIORITY_BALANCED_POWER_ACCURACY)
                .setDurationMillis(WAIT_MS)
                .setMaxUpdateAgeMillis(LAST_KNOWN_MAX_AGE_MS)
                .build();
            client
                .getCurrentLocation(balanced, gmsCancel.getToken())
                .addOnSuccessListener(mainExecutor, loc -> {
                    if (loc != null) consider(loc);
                })
                .addOnFailureListener(mainExecutor, e -> {});
        } catch (Exception ignored) {}
        try {
            CurrentLocationRequest high = new CurrentLocationRequest.Builder()
                .setPriority(Priority.PRIORITY_HIGH_ACCURACY)
                .setDurationMillis(WAIT_MS)
                .setMaxUpdateAgeMillis(LAST_KNOWN_MAX_AGE_MS)
                .build();
            client
                .getCurrentLocation(high, gmsCancel.getToken())
                .addOnSuccessListener(mainExecutor, loc -> {
                    if (loc != null) consider(loc);
                })
                .addOnFailureListener(mainExecutor, e -> {});
        } catch (Exception ignored) {}
    }

    @SuppressLint("MissingPermission")
    private void pullGmsCurrent(FusedLocationProviderClient client, int priority) {
        if (gmsCancel == null) return;
        try {
            client
                .getCurrentLocation(priority, gmsCancel.getToken())
                .addOnSuccessListener(mainExecutor, loc -> {
                    if (loc != null) consider(loc);
                })
                .addOnFailureListener(mainExecutor, e -> {});
        } catch (Exception ignored) {}
    }

    @SuppressLint("MissingPermission")
    private void startManagerOnce() {
        Activity activity = getActivity();
        if (activity == null || !hasLocationPermission()) return;
        if (lm == null) lm = (LocationManager) activity.getSystemService(Activity.LOCATION_SERVICE);
        if (lm == null) return;

        Location last = bestManagerKnown(LAST_KNOWN_MAX_AGE_MS);
        if (last != null) {
            succeed(last);
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            for (String provider : managerProviders()) {
                try {
                    lm.getCurrentLocation(provider, null, mainExecutor, loc -> {
                        if (loc != null) consider(loc);
                    });
                } catch (SecurityException | IllegalArgumentException | IllegalStateException ignored) {}
            }
        }
    }

    private void consider(Location location) {
        if (location == null) return;
        if (!location.hasAccuracy() || location.getAccuracy() <= 0) return;
        Location current = warmFix;
        if (
            current == null ||
            location.getAccuracy() <= current.getAccuracy() ||
            ageMs(current) > LAST_KNOWN_MAX_AGE_MS
        ) {
            warmFix = location;
            if (accurate(location)) publishFix(location);
        }
        if (pendingId == null) return;
        if (best == null || location.getAccuracy() < best.getAccuracy()) best = location;
        if (accurate(location)) succeed(location);
    }

    private void publishFix(Location loc) {
        if (getBridge() == null) return;
        try {
            getBridge().eval("window.__karyawanGpsFix=" + toJson(loc).toString(), null);
        } catch (Exception ignored) {}
    }

    private Location bestManagerKnown(long maxAgeMs) {
        if (lm == null || !hasLocationPermission()) return null;
        Location found = null;
        for (String provider : managerProviders()) {
            try {
                Location loc = lm.getLastKnownLocation(provider);
                if (loc == null || !usable(loc, maxAgeMs)) continue;
                if (found == null || loc.getAccuracy() < found.getAccuracy()) found = loc;
            } catch (SecurityException | IllegalArgumentException ignored) {}
        }
        return found;
    }

    private List<String> managerProviders() {
        LinkedHashSet<String> names = new LinkedHashSet<>();
        if (lm != null) {
            try {
                List<String> all = lm.getAllProviders();
                if (all != null) names.addAll(all);
            } catch (Exception ignored) {}
            try {
                List<String> enabled = lm.getProviders(true);
                if (enabled != null) names.addAll(enabled);
            } catch (Exception ignored) {}
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) names.add(LocationManager.FUSED_PROVIDER);
        names.add(LocationManager.NETWORK_PROVIDER);
        names.add(LocationManager.GPS_PROVIDER);
        names.add(LocationManager.PASSIVE_PROVIDER);
        names.remove(null);
        return new ArrayList<>(names);
    }

    private FusedLocationProviderClient fusedClient() {
        Activity activity = getActivity();
        if (activity == null) return null;
        if (fused == null) {
            fused = LocationServices.getFusedLocationProviderClient(activity.getApplicationContext());
        }
        return fused;
    }

    private void succeed(Location loc) {
        String id = pendingId;
        stopAbsenWait();
        warmFix = loc;
        publishFix(loc);
        if (id == null || id.isEmpty()) return;
        try {
            deliver(id, toJson(loc));
        } catch (Exception ignored) {
            fail(id, "timeout", tagged("Tidak dapat membaca GPS. Coba lagi."));
        }
    }

    private void fail(String id, String code, String message) {
        stopAbsenWait();
        if (id == null || id.isEmpty()) return;
        try {
            JSONObject payload = new JSONObject();
            payload.put("ok", false);
            payload.put("code", code);
            payload.put("message", message);
            payload.put("v", VERSION);
            deliver(id, payload);
        } catch (Exception ignored) {}
    }

    private void abort(String code, String message) {
        String id = pendingId;
        if (id == null) {
            stopAbsenWait();
            return;
        }
        fail(id, code, message);
    }

    private void deliver(String id, JSONObject payload) {
        if (getBridge() == null) return;
        String js =
            "window.__karyawanGpsDone&&window.__karyawanGpsDone(" + JSONObject.quote(id) + "," + payload.toString() + ")";
        getBridge().eval(js, null);
    }

    private void stopAbsenWait() {
        pendingId = null;
        best = null;
        if (timeout != null) {
            main.removeCallbacks(timeout);
            timeout = null;
        }
        if (gmsCancel != null) {
            try {
                gmsCancel.cancel();
            } catch (Exception ignored) {}
            gmsCancel = null;
        }
    }

    private boolean hasLocationPermission() {
        Activity activity = getActivity();
        if (activity == null) return false;
        return hasFinePermission() ||
            ContextCompat.checkSelfPermission(activity, Manifest.permission.ACCESS_COARSE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED;
    }

    private boolean hasFinePermission() {
        Activity activity = getActivity();
        return activity != null &&
            ContextCompat.checkSelfPermission(activity, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED;
    }

    private static boolean granted(int[] grantResults) {
        if (grantResults == null || grantResults.length == 0) return false;
        for (int result : grantResults) {
            if (result == PackageManager.PERMISSION_GRANTED) return true;
        }
        return false;
    }

    private static boolean accurate(Location loc) {
        return loc != null && loc.hasAccuracy() && loc.getAccuracy() > 0 && loc.getAccuracy() <= MAX_ACCURACY_M;
    }

    private static boolean usable(Location loc, long maxAgeMs) {
        return accurate(loc) && ageMs(loc) <= maxAgeMs;
    }

    private static long ageMs(Location loc) {
        long nanos = loc.getElapsedRealtimeNanos();
        if (nanos > 0) {
            long age = (SystemClock.elapsedRealtimeNanos() - nanos) / 1_000_000L;
            return age < 0 ? Long.MAX_VALUE : age;
        }
        long age = System.currentTimeMillis() - loc.getTime();
        return age < 0 ? Long.MAX_VALUE : age;
    }

    private static String tagged(String message) {
        return message + " (app " + VERSION + ")";
    }

    private static JSONObject toJson(Location loc) throws Exception {
        JSONObject payload = new JSONObject();
        payload.put("ok", true);
        payload.put("lat", loc.getLatitude());
        payload.put("lng", loc.getLongitude());
        payload.put("accuracyM", loc.getAccuracy());
        payload.put("v", VERSION);
        return payload;
    }
}
