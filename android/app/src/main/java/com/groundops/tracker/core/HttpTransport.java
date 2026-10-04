package com.groundops.tracker.core;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * POSTs JSON as text/plain (same "simple request" the PWA uses). Apps Script answers a POST with a 302 redirect to
 * script.googleusercontent.com; HttpURLConnection follows it (re-issuing as GET, exactly like a browser) and returns the JSON.
 * The token travels in the request BODY, never in the URL. HTTPS is enforced for non-localhost hosts.
 */
public final class HttpTransport implements TrackingCore.Transport {
    private final int timeoutMs; private final boolean allowLocalHttp;

    public HttpTransport(int timeoutMs, boolean allowLocalHttp) { this.timeoutMs = timeoutMs; this.allowLocalHttp = allowLocalHttp; }

    @Override
    public TrackingCore.Response post(String url, String body) throws IOException {
        URL u = new URL(url);
        boolean https = "https".equalsIgnoreCase(u.getProtocol()), local = "localhost".equals(u.getHost()) || "127.0.0.1".equals(u.getHost());
        if (!https && !(allowLocalHttp && local)) throw new IOException("refusing non-HTTPS URL");
        HttpURLConnection c = (HttpURLConnection) u.openConnection();
        try {
            c.setRequestMethod("POST"); c.setConnectTimeout(timeoutMs); c.setReadTimeout(timeoutMs); c.setInstanceFollowRedirects(true); c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "text/plain;charset=utf-8");
            byte[] data = body.getBytes("UTF-8");
            // NOTE: no streaming mode - HttpURLConnection cannot follow Apps Script's 302 redirect for a streamed POST body.
            OutputStream os = c.getOutputStream(); os.write(data); os.close();
            int code = c.getResponseCode();
            InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            if (in != null) { byte[] buf = new byte[8192]; int n; while ((n = in.read(buf)) > 0) out.write(buf, 0, n); in.close(); }
            return new TrackingCore.Response(code, out.toString("UTF-8"));
        } finally { c.disconnect(); }
    }
}
