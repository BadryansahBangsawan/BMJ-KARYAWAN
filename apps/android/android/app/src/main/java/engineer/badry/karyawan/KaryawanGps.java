package engineer.badry.karyawan;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.location.Criteria;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.webkit.JavascriptInterface;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.concurrent.Executor;
import org.json.JSONObject;

/**
 * Native location for the remote-URL WebView. Capacitor JS plugins are not
 * injected into https://karyawan.badry.engineer, so the website talks to
 * {@code window.KaryawanGps} directly.
 */
@CapacitorPlugin(name = "KaryawanGps")
public class KaryawanGps extends Plugin {

    static final int REQ_BOOT = 2401;
    static final int REQ_GPS = 2402;
    private static final int MAX_ACCURACY_M = 80;
    private static final long LAST_KNOWN_MAX_AGE_MS = 60_000;
    private static final long STALE_LAST_KNOWN_MS = 300_000;
    private static final long WAIT_MS = 12_000;

    private static KaryawanGps installed;

    private final Handler main = new Handler(Looper.getMainLooper());
    private final Executor mainExecutor = command -> {
        if (Looper.myLooper() == main.getLooper()) command.run();
        else main.post(command);
    };
    private final LocationListener listener = new LocationListener() {
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

    private LocationManager lm;
    private String pendingId;
    private Location best;
    private int gen;
    private Runnable timeout;
    private CancellationSignal currentCancel;

    static boolean onActivityPermissionResult(int requestCode, int[] grantResults) {
        KaryawanGps gps = installed;
        if (gps == null || requestCode != REQ_GPS) return false;
        gps.main.post(() -> gps.onGpsPermission(grantResults));
        return true;
    }

    @Override
    public void load() {
        installed = this;
        getBridge().getWebView().addJavascriptInterface(this, "KaryawanGps");
    }

    @Override
    protected void handleOnDestroy() {
        main.post(this::stopUpdates);
        if (installed == this) installed = null;
        super.handleOnDestroy();
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
            fail(id == null ? "" : id, "timeout", "Tidak dapat membaca GPS. Coba lagi.");
            return;
        }
        stopUpdates();
        pendingId = id;
        best = null;
        int myGen = ++gen;

        Activity activity = getActivity();
        if (activity == null || activity.isFinishing()) {
            fail(id, "timeout", "Tidak dapat membaca GPS. Coba lagi.");
            return;
        }

        lm = (LocationManager) activity.getSystemService(Activity.LOCATION_SERVICE);
        if (lm == null) {
            fail(id, "timeout", "Tidak dapat membaca GPS. Coba lagi.");
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

        locate(myGen);
    }

    private void onGpsPermission(int[] grantResults) {
        if (pendingId == null) return;
        if (!granted(grantResults) || !hasLocationPermission()) {
            fail(pendingId, "denied", "Izin lokasi app belum aktif. Pengaturan → Aplikasi → Karyawan → Izin → Lokasi.");
            return;
        }
        locate(gen);
    }

    private void locate(int myGen) {
        if (myGen != gen || pendingId == null) return;
        Location last = bestLastKnown(LAST_KNOWN_MAX_AGE_MS);
        if (last != null) {
            succeed(last);
            return;
        }

        timeout = () -> {
            if (myGen != gen) return;
            if (best != null && accurate(best)) {
                succeed(best);
                return;
            }
            Location stale = bestLastKnown(STALE_LAST_KNOWN_MS);
            if (stale != null) {
                succeed(stale);
                return;
            }
            if (best != null) {
                fail(pendingId, "inaccurate", "GPS tidak akurat. Coba di luar ruangan.");
                return;
            }
            fail(pendingId, "timeout", "Tidak dapat membaca GPS. Coba lagi.");
        };
        main.postDelayed(timeout, WAIT_MS);
        subscribe();
    }

    private void subscribe() {
        if (lm == null || !hasLocationPermission()) return;

        try {
            Criteria fine = new Criteria();
            fine.setAccuracy(Criteria.ACCURACY_FINE);
            fine.setCostAllowed(true);
            lm.requestLocationUpdates(500, 0, fine, listener, Looper.getMainLooper());
        } catch (SecurityException | IllegalArgumentException | IllegalStateException ignored) {}

        try {
            Criteria coarse = new Criteria();
            coarse.setAccuracy(Criteria.ACCURACY_COARSE);
            coarse.setCostAllowed(true);
            lm.requestLocationUpdates(500, 0, coarse, listener, Looper.getMainLooper());
        } catch (SecurityException | IllegalArgumentException | IllegalStateException ignored) {}

        for (String provider : knownProviders()) {
            listen(provider);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            currentCancel = new CancellationSignal();
            for (String provider : knownProviders()) {
                try {
                    lm.getCurrentLocation(provider, currentCancel, mainExecutor, loc -> {
                        if (loc != null) consider(loc);
                    });
                } catch (SecurityException | IllegalArgumentException | IllegalStateException ignored) {}
            }
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                android.location.LocationRequest req = new android.location.LocationRequest.Builder(500)
                    .setQuality(android.location.LocationRequest.QUALITY_HIGH_ACCURACY)
                    .setDurationMillis(WAIT_MS)
                    .setMaxUpdates(8)
                    .build();
                lm.requestLocationUpdates(LocationManager.FUSED_PROVIDER, req, mainExecutor, listener);
            } catch (SecurityException | IllegalArgumentException | IllegalStateException ignored) {}
        }
    }

    private void listen(String provider) {
        if (lm == null || provider == null || !hasLocationPermission()) return;
        try {
            lm.requestLocationUpdates(provider, 500, 0, listener, Looper.getMainLooper());
        } catch (SecurityException | IllegalArgumentException | IllegalStateException ignored) {}
    }

    private void consider(Location location) {
        if (pendingId == null || location == null) return;
        if (!location.hasAccuracy() || location.getAccuracy() <= 0) return;
        if (best == null || location.getAccuracy() < best.getAccuracy()) best = location;
        if (accurate(location)) succeed(location);
    }

    private Location bestLastKnown(long maxAgeMs) {
        if (lm == null || !hasLocationPermission()) return null;
        Location found = null;
        for (String provider : knownProviders()) {
            try {
                Location loc = lm.getLastKnownLocation(provider);
                if (loc == null || !accurate(loc) || ageMs(loc) > maxAgeMs) continue;
                if (found == null || loc.getAccuracy() < found.getAccuracy()) found = loc;
            } catch (SecurityException | IllegalArgumentException ignored) {}
        }
        return found;
    }

    private List<String> knownProviders() {
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
        names.add(LocationManager.GPS_PROVIDER);
        names.add(LocationManager.NETWORK_PROVIDER);
        names.add(LocationManager.PASSIVE_PROVIDER);
        names.remove(null);
        return new ArrayList<>(names);
    }

    private void succeed(Location loc) {
        String id = pendingId;
        stopUpdates();
        if (id == null || id.isEmpty()) return;
        try {
            JSONObject payload = new JSONObject();
            payload.put("ok", true);
            payload.put("lat", loc.getLatitude());
            payload.put("lng", loc.getLongitude());
            payload.put("accuracyM", loc.getAccuracy());
            deliver(id, payload);
        } catch (Exception ignored) {
            fail(id, "timeout", "Tidak dapat membaca GPS. Coba lagi.");
        }
    }

    private void fail(String id, String code, String message) {
        stopUpdates();
        if (id == null || id.isEmpty()) return;
        try {
            JSONObject payload = new JSONObject();
            payload.put("ok", false);
            payload.put("code", code);
            payload.put("message", message);
            deliver(id, payload);
        } catch (Exception ignored) {}
    }

    private void abort(String code, String message) {
        String id = pendingId;
        if (id == null) {
            stopUpdates();
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

    private void stopUpdates() {
        pendingId = null;
        best = null;
        if (timeout != null) {
            main.removeCallbacks(timeout);
            timeout = null;
        }
        if (currentCancel != null) {
            try {
                currentCancel.cancel();
            } catch (Exception ignored) {}
            currentCancel = null;
        }
        if (lm != null) {
            try {
                lm.removeUpdates(listener);
            } catch (SecurityException | IllegalArgumentException ignored) {}
        }
    }

    private boolean hasLocationPermission() {
        Activity activity = getActivity();
        if (activity == null) return false;
        return ContextCompat.checkSelfPermission(activity, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(activity, Manifest.permission.ACCESS_COARSE_LOCATION) ==
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

    private static long ageMs(Location loc) {
        long age = (SystemClock.elapsedRealtimeNanos() - loc.getElapsedRealtimeNanos()) / 1_000_000L;
        return age < 0 ? Long.MAX_VALUE : age;
    }
}
