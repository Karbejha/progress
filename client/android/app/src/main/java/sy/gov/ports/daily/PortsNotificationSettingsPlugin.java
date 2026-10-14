package sy.gov.ports.daily;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "PortsNotificationSettings")
public class PortsNotificationSettingsPlugin extends Plugin {
    @PluginMethod
    public void open(PluginCall call) {
        if (getActivity() == null) {
            call.reject("No active activity");
            return;
        }
        getActivity().runOnUiThread(() -> {
            Intent details = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:" + getContext().getPackageName()));
            try {
                Intent intent = details;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                    intent.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
                }
                getActivity().startActivity(intent);
                call.resolve();
            } catch (RuntimeException error) {
                try {
                    getActivity().startActivity(details);
                    call.resolve();
                } catch (RuntimeException fallbackError) {
                    call.reject("Unable to open notification settings");
                }
            }
        });
    }
}
