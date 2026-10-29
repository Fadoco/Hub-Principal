package com.fadoco.hubprincipal;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppUpdatePlugin.class);
        registerPlugin(AndroidTvModePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
