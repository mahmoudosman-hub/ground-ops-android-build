# Ground OPS Tracker - Android build repository

This repository only exists to build the Android APK in the cloud (GitHub Actions). You do not need Android Studio, the Android SDK or Gradle on your PC.

## Build the APK

1. Open this repository on GitHub.
2. Click **Actions** (top menu).
3. In the left list click **Build Android APK**.
4. Click **Run workflow** (grey button on the right), then the green **Run workflow** button.
5. Wait for the run to finish (first run: about 8-15 minutes). A green tick means success.
6. Click the finished run (the top line in the list).
7. Scroll to **Artifacts** at the bottom and click **ground-ops-tracker-debug-apk** to download it.
8. Unzip the download. Inside is **ground-ops-tracker-debug.apk**. Copy it to your phone and open it (Android asks you to allow installing from that source).

The run page also shows a table that inspects the built APK (foreground location service, permissions, queue, mock-location detection, your API URL).

If the run fails (red cross): open it, click **Build debug APK** under "Jobs", copy the red error text and send it to me. Do not change anything first.

## What is here
`android/` Capacitor Android project + native tracking (foreground service) · `frontend/` the web app that is packed into the APK (`frontend/config.js` holds your Apps Script URL) · `.github/workflows/build-android.yml` the cloud build · `tools/build-pwa.js` helper used by the build.

## Debug or release?
The workflow builds a **debug** APK: installs on any phone, signed automatically with a throw-away debug key, ideal for testing. A **release** APK needs your own signing key (kept as a GitHub secret). We add that only when you are ready to hand the app to employees. Debug APKs are not for the Play Store.

## Changing the backend URL
Edit `frontend/config.js` (`API_URL`) on GitHub (pencil icon), commit, run the workflow again. Never put passwords in this repository.
