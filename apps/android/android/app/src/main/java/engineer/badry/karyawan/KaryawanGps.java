package engineer.badry.karyawan;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
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
    private static final long WAIT_MS = 12_000;

    private static KaryawanGps installed;

    private final Handler main = new Handler(Looper.getMainLooper());
    private final LocationListener listener = new LocationListener() {
        @Override
        public void onLocationChanged(Location location) {
            consider(location, false);
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
    private int updateCount;
    private Runnable timeout;

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
            fail(id == null ? "" : id, "timeout", "Permintaan GPS habis waktu. Coba lagi.");
            return;
        }
        stopUpdates();
        pendingId = id;
        best = null;
        int myGen = ++gen;

        Activity activity = getActivity();
        if (activity == null || activity.isFinishing()) {
            fail(id, "timeout", "Permintaan GPS habis waktu. Coba lagi.");
            return;
        }

        lm = (LocationManager) activity.getSystemService(Activity.LOCATION_SERVICE);
        if (lm == null) {
            fail(id, "off", "Lokasi HP mati. Nyalakan lokasi di pengaturan, lalu coba lagi.");
            return;
        }
        if (!locationOn()) {
            fail(id, "off", "Lokasi HP mati. Nyalakan lokasi di pengaturan, lalu coba lagi.");
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
            fail(pendingId, "denied", "Izin GPS ditolak. Aktifkan lokasi di pengaturan.");
            return;
        }
        locate(gen);
    }

    private void locate(int myGen) {
        if (myGen != gen || pendingId == null) return;
        Location last = bestLastKnown();
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
            if (best != null) {
                fail(pendingId, "inaccurate", "GPS tidak akurat. Coba di luar ruangan.");
                return;
            }
            fail(pendingId, "timeout", "Permintaan GPS habis waktu. Coba lagi.");
        };
        main.postDelayed(timeout, WAIT_MS);

        updateCount = 0;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            listen(LocationManager.FUSED_PROVIDER);
        }
        listen(LocationManager.GPS_PROVIDER);
        listen(LocationManager.NETWORK_PROVIDER);
        if (updateCount == 0) {
            fail(pendingId, "off", "Lokasi HP mati. Nyalakan lokasi di pengaturan, lalu coba lagi.");
        }
    }

    private void listen(String provider) {
        if (lm == null || !hasLocationPermission()) return;
        try {
            if (!lm.isProviderEnabled(provider)) return;
            lm.requestLocationUpdates(provider, 500, 0, listener, Looper.getMainLooper());
            updateCount++;
        } catch (SecurityException | IllegalArgumentException | IllegalStateException ignored) {}
    }

    private void consider(Location location, boolean lastKnown) {
        if (pendingId == null || location == null) return;
        if (!location.hasAccuracy() || location.getAccuracy() <= 0) return;
        if (best == null || location.getAccuracy() < best.getAccuracy()) best = location;
        if (!lastKnown && accurate(location)) succeed(location);
    }

    private Location bestLastKnown() {
        if (lm == null || !hasLocationPermission()) return null;
        Location found = null;
        String[] providers = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
            ? new String[] {
                LocationManager.FUSED_PROVIDER,
                LocationManager.GPS_PROVIDER,
                LocationManager.NETWORK_PROVIDER,
                LocationManager.PASSIVE_PROVIDER
            }
            : new String[] {
                LocationManager.GPS_PROVIDER,
                LocationManager.NETWORK_PROVIDER,
                LocationManager.PASSIVE_PROVIDER
            };
        for (String provider : providers) {
            try {
                Location loc = lm.getLastKnownLocation(provider);
                if (loc == null || !accurate(loc) || ageMs(loc) > LAST_KNOWN_MAX_AGE_MS) continue;
                if (found == null || loc.getAccuracy() < found.getAccuracy()) found = loc;
            } catch (SecurityException | IllegalArgumentException ignored) {}
        }
        return found;
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
            fail(id, "timeout", "Permintaan GPS habis waktu. Coba lagi.");
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
        updateCount = 0;
        if (timeout != null) {
            main.removeCallbacks(timeout);
            timeout = null;
        }
        if (lm != null) {
            try {
                lm.removeUpdates(listener);
            } catch (SecurityException | IllegalArgumentException ignored) {}
        }
    }

    private boolean locationOn() {
        if (lm == null) return false;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) return lm.isLocationEnabled();
            return lm.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
                lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
        } catch (Exception ignored) {
            return false;
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
