package com.aava.cpen321project;

import androidx.appcompat.app.AppCompatActivity;

import android.content.Intent;
import android.os.Bundle;

import android.util.Log;
import android.view.View;
import android.widget.Toast;

import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.auth.api.signin.GoogleSignInClient;
import com.google.android.gms.auth.api.signin.GoogleSignInOptions;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.tasks.Task;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.security.cert.CertificateException;
import java.security.cert.X509Certificate;

import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSocketFactory;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

import okhttp3.OkHttpClient;
import okhttp3.MediaType;
import okhttp3.RequestBody;
import okhttp3.Request;
import okhttp3.Response;




public class LoginActivity extends AppCompatActivity {

    private Integer RC_SIGN_IN = 1;
    final static String TAG = "LoginActivity";

    private GoogleSignInClient mGoogleSignInClient;

    private String userToken;

    private String userName;

    //ChatGPT usage: No
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);


        setContentView(R.layout.activity_login); // Replace with your login layout name

                // Configure sign-in to request the user's ID, email address, and basic
                // profile. ID and basic profile are included in DEFAULT_SIGN_IN.
        GoogleSignInOptions gso = new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
                .requestIdToken(getString(R.string.server_client_id))
                .requestEmail()
                .build();

        mGoogleSignInClient = GoogleSignIn.getClient(this,gso);

                findViewById(R.id.signin_button).setOnClickListener(new View.OnClickListener() {
                    @Override
                    public void onClick(View v) {

                        Log.d(TAG,"Reached click");

                        signIn();

                    }
                });


        }

    //ChatGPT usage: No
    //reference: https://developers.google.com/identity/sign-in/android/start-integrating
    private void signIn() {

        Intent signInIntent = mGoogleSignInClient.getSignInIntent();
        startActivityForResult(signInIntent, RC_SIGN_IN);

    }

    //ChatGPT usage:No
    //reference: https://developers.google.com/identity/sign-in/android/start-integrating
    @Override
    public void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode == RC_SIGN_IN) {
            // The Task returned from this call is always completed, no need to attach
            // a listener.
            Task<GoogleSignInAccount> task = GoogleSignIn.getSignedInAccountFromIntent(data);
            handleSignInResult(task);
        }
    }

    //ChatGPT usage: No
    private void handleSignInResult(Task<GoogleSignInAccount> completedTask) {
        try {
            GoogleSignInAccount account = completedTask.getResult(ApiException.class);

            // Signed in successfully, show authenticated UI.
            //TODO change function name and do spec stuff
            loggedIn(account);
        } catch (ApiException e) {
            // The ApiException status code indicates the detailed failure reason.
            // Please refer to the GoogleSignInStatusCodes class reference for more information.
            Log.w(TAG, "signInResult:failed code=" + e.getStatusCode());
            //loggedIn(null);
        }
    }

    //ChatGPT usage: No
    @Override
    protected void onStart() {
        super.onStart();
        // Check for existing Google Sign In account, if the user is already signed in
        // the GoogleSignInAccount will be non-null.
        GoogleSignInAccount account = GoogleSignIn.getLastSignedInAccount(this);
        loggedIn(account);
    }

    //ChatGPT usage: No
    private void showToast(final String text) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                Log.d(TAG, "Showing toast: " + text);
                Toast.makeText(getApplicationContext(), text, Toast.LENGTH_LONG).show();
            }
        });
    }

    //ChatGPT usage: No
    //After user successfully log into their google account, talk to server to log in kashoot
    private void loggedIn(GoogleSignInAccount account) {
        if(account == null){
            Log.d(TAG, "no users signed in");
        }
        else{
            Log.d(TAG, "Pref Name: " + account.getDisplayName());
            Log.d(TAG, "Email: " + account.getEmail());
            Log.d(TAG, "Display URL: " + account.getPhotoUrl());
            Log.d(TAG, "Given Name: " + account.getGivenName());
            Log.d(TAG, "id: " + account.getId());

            userToken = account.getId();
            //use unique getId
            //sendTokenToBackend(token);
            Log.d(TAG,"userToken from google" + userToken);

            String email = account.getEmail();
            userName = email.substring(0, email.indexOf('@'));
            login(userToken, userName);


        }
    }

    //ChatGPT usage: Partial
    //Create account in backend
    private void createAccount(String gtoken, String gusername) {
        try {
            JSONObject data = new JSONObject();
            data.put("token", gtoken);
            data.put("username", gusername);

            RequestBody body = RequestBody.create(MediaType.parse("application/json"), data.toString());
            Request request = new Request.Builder()
                    .url(getResources().getString(R.string.serverURL)+ "/create-account")
                    .post(body)
                    .build();

            OkHttpClient insecureClient = getInsecureOkHttpClient();
            insecureClient.newCall(request).enqueue(new okhttp3.Callback() {
                @Override
                public void onFailure(okhttp3.Call call, IOException e) {
                    e.printStackTrace();
                    // Handle failure
                    showToast("Network Error: Unable to connect to the server. Please check your internet connection and try again.");
                    Log.e(TAG, "httpClient onFailure", e);

                }

                @Override
                public void onResponse(okhttp3.Call call, Response response) throws IOException {
                    if (!response.isSuccessful()) {
                        // Handle error
                        Log.d(TAG, "HTTP Error: " + response.code());
                        Log.d(TAG, "Error receiving response form back end");
                        Log.e(TAG,""+ response.body().string());
                        return;
                    }

                    if (response.body() != null) {
                        String jsonResponse = response.body().string();
                        try {
                            JSONObject responseObject = new JSONObject(jsonResponse);
                            if (responseObject.has("token")) {
                                String userToken = responseObject.getString("token");
                                String username = responseObject.getString("username");

                                // Handle success and update UI
                                Log.d(TAG, "Created account backend: " + username + userToken);
                                login(userToken,username);

                            } else if (responseObject.has("message")) {
                                // Handle error
                                String message = responseObject.getString("message");
                                Log.e(TAG, "Error creating account: " + message);
                                // Update UI to show error message, etc.
                            }
                        } catch (JSONException e) {
                            e.printStackTrace();
                            Log.e(TAG, "Failed to parse create account response", e);
                        }
                    }
                }
            });
        } catch (JSONException e) {
            e.printStackTrace();
            Log.e(TAG, "Failed to create JSON object for create account", e);
        }
    }

    //ChatGPT usage: Partial
    private void login(String token, String userName) {
        try {
            JSONObject data = new JSONObject();
            data.put("token", token);

            RequestBody body = RequestBody.create(MediaType.parse("application/json"), data.toString());
            Request request = new Request.Builder()
                    .url(getResources().getString(R.string.serverURL)+ "/login") // update with your endpoint
                    .post(body)
                    .build();

            OkHttpClient insecureClient = getInsecureOkHttpClient();

            insecureClient.newCall(request).enqueue(new okhttp3.Callback() {
                @Override
                public void onFailure(okhttp3.Call call, IOException e) {
                    e.printStackTrace();
                    // Handle failure
                    showToast("Network Error: Unable to connect to the server. Please check your internet connection and try again.");
                    Log.e(TAG, "httpClient onFailure", e);

                }

                @Override
                public void onResponse(okhttp3.Call call, Response response) throws IOException {
                    if (!response.isSuccessful()) {
                        // Handle error
                        Log.d(TAG, "HTTP Error: " + response.code());
                        Log.d(TAG, "check parameters " + token + " username" + userName);
                        //createAccount(token, userName);
                        Log.e(TAG,""+ response.body().string());
                        createAccount(token, userName);
                        return;
                    }

                    if (response.body() != null) {
                        String jsonResponse = response.body().string();
                        try {
                            JSONObject responseObject = new JSONObject(jsonResponse);
                            if (responseObject.has("token")) {
                                String userToken = responseObject.getString("token");
                                String username = responseObject.getString("username");
                                //before get the value always check if the field exist
                                String sessionToken = responseObject.getString("sessionToken");
                                int rank = responseObject.getInt("rank");
                                Log.d(TAG,"get Rank" + String.valueOf(rank));
                                navigateToMenuActivity(username, userToken, sessionToken,rank);
                                // Handle success, update UI, store session token, etc.
                            } else if (responseObject.has("message")) {
                                // Handle error
                                String message = responseObject.getString("message");
                                Log.d(TAG, "Error logging in: " + message);
                                // Update UI to show error message, etc.
                                if(message.equals("Unable to find the user for this account.")){
                                    createAccount(token, userName);
                                }
                            }
                        } catch (JSONException e) {
                            e.printStackTrace();
                            Log.e(TAG, "Failed to parse login response", e);
                        }
                    }
                }
            });
        } catch (JSONException e) {
            e.printStackTrace();
            Log.e(TAG, "Failed to create JSON object for login", e);
        }
    }

    //ChatGPT usage: No
    private void navigateToMenuActivity(String userName, String userToken, String sessionToken, int rank) {
        Intent intent = new Intent(LoginActivity.this, MenuActivity.class);
        intent.putExtra("userName", userName);
        intent.putExtra("userToken", userToken);
        intent.putExtra("sessionToken", sessionToken);
        intent.putExtra("userRank", rank);
        startActivity(intent);
    }



    //ChatGPT usage: Yes
    //created OkHttpClient instance is that it is configured to trust all SSL/TLS certificates
    static public OkHttpClient getInsecureOkHttpClient() {
        try {
            // Create a trust manager that does not validate certificate chains
            final TrustManager[] trustAllCerts = new TrustManager[]{
                    new X509TrustManager() {
                        @Override
                        public void checkClientTrusted(X509Certificate[] chain, String authType) throws CertificateException {
                            // Intentionally left empty as no specific logic is required here
                        }

                        @Override
                        public void checkServerTrusted(X509Certificate[] chain, String authType) throws CertificateException {
                            // Intentionally left empty as no specific logic is required here
                        }

                        @Override
                        public X509Certificate[] getAcceptedIssuers() {
                            return new X509Certificate[]{};
                        }
                    }
            };

            // Install the all-trusting trust manager
            final SSLContext sslContext = SSLContext.getInstance("SSL");
            sslContext.init(null, trustAllCerts, new java.security.SecureRandom());

            // Create an ssl socket factory with our all-trusting manager
            final SSLSocketFactory sslSocketFactory = sslContext.getSocketFactory();

            OkHttpClient.Builder builder = new OkHttpClient.Builder();
            builder.sslSocketFactory(sslSocketFactory, (X509TrustManager) trustAllCerts[0]);
            builder.hostnameVerifier((hostname, session) -> true);

            return builder.build();

        } catch (Exception e) {
            throw new InsecureOkHttpClientException(e);
        }
    }

    static class InsecureOkHttpClientException extends RuntimeException {
        public InsecureOkHttpClientException(Throwable cause) {
            super(cause);
        }
    }

    @Override
    public void onBackPressed() {
        // super.onBackPressed();   // Comment this line to disable back button
    }



}


