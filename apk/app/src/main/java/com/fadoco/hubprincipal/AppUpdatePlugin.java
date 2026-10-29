package com.fadoco.hubprincipal;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;

@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {
    private static final long MAX_APK_BYTES = 100L * 1024L * 1024L;
    private static final String APK_NAME = "Hub-Principal.apk";
    private static final String APK_HOST = "fadoco.github.io";
    private static final String APK_PATH = "/Hub-Principal/updates/Hub-Principal.apk";

    @PluginMethod
    public void getAppVersion(PluginCall call) {
        try {
            PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            JSObject result = new JSObject();
            result.put("versionName", info.versionName == null ? "0.0.0" : info.versionName);
            call.resolve(result);
        } catch (Exception exception) {
            call.reject("Não foi possível identificar a versão instalada.", exception);
        }
    }

    @PluginMethod
    public void downloadUpdate(PluginCall call) {
        String downloadUrl = call.getString("url");
        String expectedSha256 = call.getString("sha256");

        if (!isValidReleaseUrl(downloadUrl) || expectedSha256 == null || !expectedSha256.matches("(?i)[a-f0-9]{64}")) {
            call.reject("O link ou a verificação de integridade do APK é inválido.");
            return;
        }

        new Thread(() -> downloadApk(call, downloadUrl, expectedSha256)).start();
    }

    @PluginMethod
    public void installDownloadedUpdate(PluginCall call) {
        File apkFile = new File(new File(getContext().getCacheDir(), "updates"), APK_NAME);
        if (!apkFile.isFile()) {
            call.reject("O APK da atualização não está disponível. Baixe-o novamente.");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
            try {
                Intent settingsIntent = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName())
                );
                getActivity().startActivity(settingsIntent);
                JSObject result = new JSObject();
                result.put("status", "permission_required");
                call.resolve(result);
            } catch (Exception exception) {
                call.reject("Não foi possível abrir as configurações de instalação do Android.", exception);
            }
            return;
        }

        try {
            Uri apkUri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                apkFile
            );
            Intent installIntent = new Intent(Intent.ACTION_VIEW);
            installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(installIntent);
            JSObject result = new JSObject();
            result.put("status", "installer_opened");
            call.resolve(result);
        } catch (Exception exception) {
            call.reject("Não foi possível abrir o instalador do Android.", exception);
        }
    }

    private void downloadApk(PluginCall call, String downloadUrl, String expectedSha256) {
        File updatesDirectory = new File(getContext().getCacheDir(), "updates");
        File temporaryFile = new File(updatesDirectory, APK_NAME + ".part");
        File apkFile = new File(updatesDirectory, APK_NAME);
        HttpURLConnection connection = null;

        try {
            if (!updatesDirectory.isDirectory() && !updatesDirectory.mkdirs()) {
                throw new IllegalStateException("Não foi possível preparar o armazenamento da atualização.");
            }

            connection = (HttpURLConnection) new URL(downloadUrl).openConnection();
            connection.setRequestMethod("GET");
            connection.setUseCaches(false);
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(30000);
            connection.setInstanceFollowRedirects(true);
            connection.setRequestProperty("Cache-Control", "no-cache");
            connection.setRequestProperty("Accept", "application/vnd.android.package-archive");
            connection.setRequestProperty("User-Agent", "HubPrincipal-Android-Updater");

            int responseCode = connection.getResponseCode();
            if (responseCode != HttpURLConnection.HTTP_OK || !isAllowedDownloadHost(connection.getURL().getHost())) {
                throw new IllegalStateException("O GitHub não forneceu um arquivo de atualização válido.");
            }

            long contentLength = connection.getContentLengthLong();
            if (contentLength > MAX_APK_BYTES) {
                throw new IllegalStateException("O arquivo de atualização excede o tamanho permitido.");
            }

            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            long totalBytes = 0;
            byte[] buffer = new byte[16384];
            try (InputStream input = connection.getInputStream();
                 FileOutputStream output = new FileOutputStream(temporaryFile)) {
                int bytesRead;
                while ((bytesRead = input.read(buffer)) != -1) {
                    totalBytes += bytesRead;
                    if (totalBytes > MAX_APK_BYTES) {
                        throw new IllegalStateException("O arquivo de atualização excede o tamanho permitido.");
                    }
                    digest.update(buffer, 0, bytesRead);
                    output.write(buffer, 0, bytesRead);
                }
            }

            String actualSha256 = toHex(digest.digest());
            if (!actualSha256.equalsIgnoreCase(expectedSha256)) {
                throw new IllegalStateException("A verificação de integridade do APK falhou. O arquivo não será instalado.");
            }

            if (apkFile.exists() && !apkFile.delete()) {
                throw new IllegalStateException("Não foi possível substituir o arquivo de atualização anterior.");
            }
            if (!temporaryFile.renameTo(apkFile)) {
                throw new IllegalStateException("Não foi possível salvar o arquivo de atualização.");
            }

            call.resolve();
        } catch (Exception exception) {
            temporaryFile.delete();
            call.reject(
                exception.getMessage() == null ? "Não foi possível baixar a atualização." : exception.getMessage(),
                exception
            );
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private boolean isValidReleaseUrl(String value) {
        if (value == null || !value.startsWith("https://fadoco.github.io/")) return false;
        try {
            URL url = new URL(value);
            return APK_HOST.equalsIgnoreCase(url.getHost()) &&
                APK_PATH.equals(url.getPath()) &&
                url.getQuery() != null &&
                url.getQuery().matches("v=[1-9][0-9]*");
        } catch (Exception exception) {
            return false;
        }
    }

    private boolean isAllowedDownloadHost(String host) {
        String normalizedHost = host.toLowerCase(Locale.ROOT);
        return APK_HOST.equals(normalizedHost);
    }

    private String toHex(byte[] bytes) {
        StringBuilder result = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) result.append(String.format(Locale.ROOT, "%02x", value & 0xff));
        return result.toString();
    }
}
