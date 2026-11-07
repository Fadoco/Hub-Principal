package com.fadoco.hubprincipal;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "WeatherNotifications",
    permissions = {
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class WeatherNotificationsPlugin extends Plugin {
    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            resolvePermission(call);
            return;
        }

        if (getPermissionState("notifications") == PermissionState.GRANTED) {
            resolvePermission(call);
            return;
        }

        requestPermissionForAlias("notifications", call, "notificationPermissionResult");
    }

    @PermissionCallback
    private void notificationPermissionResult(PluginCall call) {
        resolvePermission(call);
    }

    @PluginMethod
    public void configure(PluginCall call) {
        Boolean enabled = call.getBoolean("enabled");
        if (enabled == null) {
            call.reject("Não foi informado se os avisos do clima devem ser ativados.");
            return;
        }

        if (enabled) {
            Double latitude = call.getDouble("latitude");
            Double longitude = call.getDouble("longitude");
            String city = call.getString("city");
            String state = call.getString("state", "");
            if (latitude == null || longitude == null || city == null || city.trim().isEmpty() ||
                latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
                call.reject("Selecione uma cidade válida antes de ativar os avisos do clima.");
                return;
            }

            getContext().getSharedPreferences(WeatherNotificationWorker.PREFERENCES, 0)
                .edit()
                .putBoolean(WeatherNotificationWorker.KEY_ENABLED, true)
                .putFloat(WeatherNotificationWorker.KEY_LATITUDE, latitude.floatValue())
                .putFloat(WeatherNotificationWorker.KEY_LONGITUDE, longitude.floatValue())
                .putString(WeatherNotificationWorker.KEY_CITY, city.trim())
                .putString(WeatherNotificationWorker.KEY_STATE, state.trim())
                .apply();
            WeatherNotificationWorker.schedule(getContext());
        } else {
            getContext().getSharedPreferences(WeatherNotificationWorker.PREFERENCES, 0)
                .edit()
                .putBoolean(WeatherNotificationWorker.KEY_ENABLED, false)
                .apply();
            WeatherNotificationWorker.cancel(getContext());
        }

        call.resolve();
    }

    @PluginMethod
    public void showTestNotification(PluginCall call) {
        String city = call.getString("city");
        String state = call.getString("state", "");
        if (city == null || city.trim().isEmpty()) {
            call.reject("Escolha uma cidade antes de testar a notificação.");
            return;
        }

        if (!NotificationManagerCompat.from(getContext()).areNotificationsEnabled()) {
            call.reject("As notificações do Hub Principal estão bloqueadas nas configurações do Android.");
            return;
        }

        try {
            WeatherNotificationWorker.showTestNotification(getContext(), city.trim(), state.trim());
            call.resolve();
        } catch (SecurityException exception) {
            call.reject("O Android não permitiu exibir a notificação de teste.", exception);
        }
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            String packageName = getContext().getPackageName();
            intent.putExtra(Settings.EXTRA_APP_PACKAGE, packageName);
            intent.setData(Uri.fromParts("package", packageName, null));
            if (intent.resolveActivity(getContext().getPackageManager()) == null) {
                intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                intent.setData(Uri.fromParts("package", packageName, null));
            }
            getActivity().startActivity(intent);
            call.resolve();
        } catch (Exception exception) {
            call.reject("Não foi possível abrir as configurações de notificações do Android.", exception);
        }
    }

    private void resolvePermission(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", NotificationManagerCompat.from(getContext()).areNotificationsEnabled());
        call.resolve(result);
    }
}
