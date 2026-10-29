package com.fadoco.hubprincipal;

import android.content.pm.ActivityInfo;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AndroidTvMode")
public class AndroidTvModePlugin extends Plugin {
    @PluginMethod
    public void setTvMode(PluginCall call) {
        Boolean enabled = call.getBoolean("enabled");
        if (enabled == null) {
            call.reject("Não foi possível alterar a orientação do modo TV.");
            return;
        }

        try {
            getActivity().setRequestedOrientation(
                enabled
                    ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                    : ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
            );
            call.resolve();
        } catch (Exception exception) {
            call.reject("Não foi possível alterar a orientação da tela.", exception);
        }
    }
}
