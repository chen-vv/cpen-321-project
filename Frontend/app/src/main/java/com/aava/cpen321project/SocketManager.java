package com.aava.cpen321project;

import android.util.Log;

import java.net.URISyntaxException;

import io.socket.client.IO;
import io.socket.client.Socket;

public class SocketManager {

    private static final String TAG = "SocketManager";
    private static final String SERVER_URL = "http://35.212.247.165:8081";

    private static Socket socket;

    private SocketManager() {
        try {
            socket = IO.socket(SERVER_URL);
        } catch (URISyntaxException e) {
            Log.e(TAG, e.getReason());
        }
    }

    public static Socket getInstance() {
        if (socket == null) {
            new SocketManager();
        }
        return socket;
    }
}
