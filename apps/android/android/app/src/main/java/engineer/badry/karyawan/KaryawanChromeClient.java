package engineer.badry.karyawan;

import android.Manifest;
import android.content.pm.PackageManager;
import android.webkit.GeolocationPermissions;
import androidx.core.content.ContextCompat;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;

/**
 * Capacitor's chrome client calls {@code super} first, which denies geolocation,
 * then requires both FINE and COARSE. Approximate-only (Android 12+) therefore
 * fails the WebView fallback even when the OS already allowed location.
 */
public class KaryawanChromeClient extends BridgeWebChromeClient {

    private final Bridge bridge;

    public KaryawanChromeClient(Bridge bridge) {
        super(bridge);
        this.bridge = bridge;
    }

    @Override
    public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
        boolean allowed =
            ContextCompat.checkSelfPermission(bridge.getContext(), Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(bridge.getContext(), Manifest.permission.ACCESS_COARSE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED;
        callback.invoke(origin, allowed, true);
    }
}
