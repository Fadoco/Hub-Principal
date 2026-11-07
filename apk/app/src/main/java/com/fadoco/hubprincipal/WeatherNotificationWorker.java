package com.fadoco.hubprincipal;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.nio.charset.StandardCharsets;
import java.net.URL;
import java.util.concurrent.TimeUnit;

public class WeatherNotificationWorker extends Worker {
    static final String PREFERENCES = "weather_notifications";
    static final String KEY_ENABLED = "enabled";
    static final String KEY_LATITUDE = "latitude";
    static final String KEY_LONGITUDE = "longitude";
    static final String KEY_CITY = "city";
    static final String KEY_STATE = "state";

    private static final String PERIODIC_WORK_NAME = "weather-notification-periodic";
    private static final String INITIAL_WORK_NAME = "weather-notification-initial";
    private static final String CHANNEL_ID = "weather_updates";
    private static final int NOTIFICATION_ID = 8701;
    private static final String TAG = "WeatherNotification";

    public WeatherNotificationWorker(@NonNull Context context, @NonNull WorkerParameters parameters) {
        super(context, parameters);
    }

    static void schedule(Context context) {
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build();
        WorkManager workManager = WorkManager.getInstance(context);
        PeriodicWorkRequest periodicRequest = new PeriodicWorkRequest.Builder(
            WeatherNotificationWorker.class, 30, TimeUnit.MINUTES
        ).setConstraints(constraints).build();
        OneTimeWorkRequest initialRequest = new OneTimeWorkRequest.Builder(WeatherNotificationWorker.class)
            .setConstraints(constraints)
            .build();

        workManager.enqueueUniquePeriodicWork(
            PERIODIC_WORK_NAME, ExistingPeriodicWorkPolicy.UPDATE, periodicRequest
        );
        workManager.enqueueUniqueWork(INITIAL_WORK_NAME, ExistingWorkPolicy.REPLACE, initialRequest);
    }

    static void cancel(Context context) {
        WorkManager workManager = WorkManager.getInstance(context);
        workManager.cancelUniqueWork(PERIODIC_WORK_NAME);
        workManager.cancelUniqueWork(INITIAL_WORK_NAME);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        android.content.SharedPreferences preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
        if (!preferences.getBoolean(KEY_ENABLED, false)) return Result.success();
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return Result.success();

        float latitude = preferences.getFloat(KEY_LATITUDE, Float.NaN);
        float longitude = preferences.getFloat(KEY_LONGITUDE, Float.NaN);
        String city = preferences.getString(KEY_CITY, "");
        String state = preferences.getString(KEY_STATE, "");
        if (Float.isNaN(latitude) || Float.isNaN(longitude) || city == null || city.trim().isEmpty()) {
            Log.w(TAG, "Aviso ignorado: não há uma localização válida salva.");
            return Result.failure();
        }

        try {
            JSONObject forecast = fetchForecast(latitude, longitude);
            String currentTemperature = Math.round(forecast.getJSONObject("current").getDouble("temperature_2m")) + "°C";
            JSONObject hourly = forecast.getJSONObject("hourly");
            JSONArray times = hourly.getJSONArray("time");
            JSONArray probabilities = hourly.getJSONArray("precipitation_probability");
            String currentTime = forecast.getJSONObject("current").optString("time", "");
            int firstIndex = 0;
            while (firstIndex < times.length() && times.getString(firstIndex).compareTo(currentTime) < 0) firstIndex++;

            int lastIndex = Math.min(firstIndex + 24, Math.min(times.length(), probabilities.length()));
            int highestProbability = -1;
            String highestProbabilityTime = "";
            for (int index = firstIndex; index < lastIndex; index++) {
                int probability = probabilities.isNull(index) ? -1 : probabilities.getInt(index);
                if (probability > highestProbability) {
                    highestProbability = probability;
                    highestProbabilityTime = times.getString(index);
                }
            }
            if (highestProbability < 0) throw new IllegalStateException("A previsão não trouxe chance de chuva por hora.");

            String rainSummary = highestProbability == 0
                ? "Chance máxima de chuva: 0% nas próximas 24 h."
                : "Maior chance de chuva: " + highestProbability + "% às " +
                    (highestProbabilityTime.length() >= 16 ? highestProbabilityTime.substring(11, 16) : "--:--") + ".";
            showNotification(context, "Clima em " + city + (state.isEmpty() ? "" : " - " + state),
                "Temperatura: " + currentTemperature + ". " + rainSummary, NOTIFICATION_ID);
            return Result.success();
        } catch (Exception exception) {
            Log.w(TAG, "Não foi possível atualizar o resumo meteorológico.", exception);
            return Result.retry();
        }
    }

    private JSONObject fetchForecast(float latitude, float longitude) throws Exception {
        Uri uri = Uri.parse("https://api.open-meteo.com/v1/forecast").buildUpon()
            .appendQueryParameter("latitude", String.valueOf(latitude))
            .appendQueryParameter("longitude", String.valueOf(longitude))
            .appendQueryParameter("current", "temperature_2m")
            .appendQueryParameter("hourly", "precipitation_probability")
            .appendQueryParameter("forecast_days", "2")
            .appendQueryParameter("timezone", "auto")
            .build();
        HttpURLConnection connection = (HttpURLConnection) new URL(uri.toString()).openConnection();
        connection.setRequestMethod("GET");
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(15000);
        connection.setRequestProperty("Accept", "application/json");
        try {
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) throw new IllegalStateException("Open-Meteo respondeu HTTP " + status + ".");
            try (InputStream input = connection.getInputStream();
                 BufferedReader reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) {
                StringBuilder body = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) body.append(line);
                return new JSONObject(body.toString());
            }
        } finally {
            connection.disconnect();
        }
    }

    static void showTestNotification(Context context, String city, String state) {
        String message = "Temperatura: 24°C. Maior chance de chuva: 40% às 16:00. Esta é uma notificação de teste.";
        showNotification(context, "Teste do clima em " + city + (state.isEmpty() ? "" : " - " + state),
            message, NOTIFICATION_ID + 1);
    }

    private static void showNotification(Context context, String title, String message, int notificationId) {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "Resumo do clima", NotificationManager.IMPORTANCE_DEFAULT
            );
            channel.setDescription("Temperatura e previsão de chuva da cidade selecionada.");
            manager.createNotificationChannel(channel);
        }

        Intent launchIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        PendingIntent pendingIntent = launchIntent == null ? null : PendingIntent.getActivity(
            context, 0, launchIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        NotificationCompat.Builder notification = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(message)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(message))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true);
        if (pendingIntent != null) notification.setContentIntent(pendingIntent);

        try {
            NotificationManagerCompat.from(context).notify(notificationId, notification.build());
        } catch (SecurityException exception) {
            Log.w(TAG, "O Android não permitiu exibir a notificação.", exception);
            throw exception;
        }
    }
}
