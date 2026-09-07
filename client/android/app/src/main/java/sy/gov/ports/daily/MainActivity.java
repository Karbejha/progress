package sy.gov.ports.daily;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        applySystemBarStyles();
    }

    @Override
    public void onResume() {
        super.onResume();
        applySystemBarStyles();
    }

    private void applySystemBarStyles() {
        try {
            Window window = getWindow();
            int darkGreen = Color.parseColor("#05261e");

            window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
            window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            window.setStatusBarColor(darkGreen);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                window.setNavigationBarColor(darkGreen);
            }

            View decorView = window.getDecorView();
            WindowInsetsControllerCompat insetsController = WindowCompat.getInsetsController(window, decorView);
            if (insetsController != null) {
                // false = Light text and icons for dark background
                insetsController.setAppearanceLightStatusBars(false);
                insetsController.setAppearanceLightNavigationBars(false);
            }
        } catch (Exception ignored) {
        }
    }
}
