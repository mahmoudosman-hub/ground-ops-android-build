# Ground OPS Android - Build & Release Guide

## Prerequisites

- **Android Studio:** Latest stable version
- **Android SDK:** API level 34
- **Java:** JDK 11 or higher
- **Gradle:** 8.0+ (included with Android Studio)
- **Git:** Latest version

## Project Setup

### 1. Clone Repository

```bash
git clone https://github.com/mahmoudosman-hub/ground-ops-android-build.git
cd ground-ops-android-build
```

### 2. Setup Android SDK

In Android Studio:
1. Go to: SDK Manager
2. Install Android SDK 34
3. Install Build-Tools 34.0.0
4. Accept all licenses

### 3. Generate Keystore for Signing

Create a release keystore:

```bash
keytool -genkey -v -keystore release.keystore \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias ground-ops
```

When prompted, enter:
- **Key password:** Choose a strong password
- **Store password:** Same or different
- **First and last name:** Your name
- **Organization:** Ground OPS
- **City:** Cairo
- **State:** Cairo
- **Country:** EG

Move the keystore to `android/`:

```bash
mv release.keystore android/
```

### 4. Create Signing Configuration

Copy the template:

```bash
cp android/keystore.properties.example android/keystore.properties
```

Edit `android/keystore.properties`:

```properties
storeFile=../release.keystore
storePassword=YOUR_PASSWORD_HERE
keyAlias=ground-ops
keyPassword=YOUR_PASSWORD_HERE
```

**⚠️ IMPORTANT:** `keystore.properties` is in `.gitignore`. Never commit it!

### 5. Setup Firebase

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create/select project: `ground-ops-tracker`
3. Add Android app
4. Download `google-services.json`
5. Place in `android/app/google-services.json`

**Note:** `google-services.json` is in `.gitignore`. Never commit it!

## Building

### Debug Build

Build an APK for testing:

```bash
cd android
./gradlew assembleDebug
```

Output: `app/build/outputs/apk/debug/app-debug.apk`

### Release Build (Unsigned)

```bash
cd android
./gradlew assembleRelease
```

This will fail if `keystore.properties` is missing. That's expected.

### Release Build (Signed)

With `keystore.properties` configured:

```bash
cd android
./gradlew assembleRelease
```

Output: `app/build/outputs/apk/release/app-release.apk`

### Build Bundle (for Play Store)

```bash
cd android
./gradlew bundleRelease
```

Output: `app/build/outputs/bundle/release/app-release.aab`

## Optimization

### Enable ProGuard

ProGuard is now enabled for release builds to:
- Reduce APK size (25-40% smaller)
- Obfuscate code for security
- Optimize performance

ProGuard rules are in: `android/app/proguard-rules.pro`

To add custom rules for your libraries:

```proguard
-keep class your.package.name.** { *; }
-dontwarn your.package.name.**
```

### Check Build Size

```bash
cd android/app/build/outputs/apk/release
ls -lh app-release.apk
```

## Testing

### Run Unit Tests

```bash
cd android
./gradlew test
```

### Run Instrumented Tests

```bash
cd android
./gradlew connectedAndroidTest
```

### Run Lint

```bash
cd android
./gradlew lint
```

Generates report: `app/build/reports/lint-results.html`

## CI/CD

GitHub Actions automatically builds on:
- Every push to `main` or `develop`
- Every pull request

See: `.github/workflows/android-build.yml`

## Troubleshooting

### Gradle Sync Failed

```bash
cd android
./gradlew clean
./gradlew sync
```

### Build Fails - Missing Dependencies

```bash
cd android
./gradlew dependencies
```

Update `variables.gradle` if needed.

### google-services.json Not Found

Download from Firebase Console and place in `android/app/`

### ProGuard Errors

Add exceptions to `proguard-rules.pro`:

```proguard
-keep class your.library.** { *; }
```

## Release Checklist

Before releasing to Play Store:

- [ ] Version code incremented in `build.gradle`
- [ ] Version name updated (semver)
- [ ] Google Play Console signed in
- [ ] Release notes prepared
- [ ] Screenshots updated
- [ ] All tests passing
- [ ] Lint warnings reviewed
- [ ] ProGuard enabled
- [ ] Release APK/Bundle built
- [ ] APK tested on device
- [ ] Crash logs reviewed
- [ ] Privacy policy updated

## Release Process

1. **Create release branch:**
   ```bash
   git checkout -b release/1.5.0
   ```

2. **Update version:**
   ```gradle
   versionCode 20
   versionName "1.5.0"
   ```

3. **Build release bundle:**
   ```bash
   ./gradlew bundleRelease
   ```

4. **Upload to Google Play Console:**
   - Go to Production release
   - Upload bundle
   - Add release notes
   - Submit for review

5. **Merge and tag:**
   ```bash
   git tag -a v1.5.0 -m "Release 1.5.0"
   git push origin v1.5.0
   ```

## Performance Tips

- Use ProGuard/R8 minification
- Remove debug logs in production
- Optimize images and resources
- Use vector drawables
- Lazy-load non-essential features
- Monitor app size with bundletool

## Security Checklist

- [ ] Keystore password stored securely
- [ ] No hardcoded secrets
- [ ] HTTPS for all API calls
- [ ] Input validation
- [ ] ProGuard enabled
- [ ] Cleartext traffic disabled
- [ ] Permissions minimal
- [ ] Error logs secure

## Support

For issues or questions:
1. Check logs in Android Studio
2. Review code comments
3. Check GitHub issues
4. Ask team for help

## Related Files

- [Code Review Report](../CODE_REVIEW_REPORT.md)
- [Keystore Configuration](../keystore.properties.example)
- [ProGuard Rules](../app/proguard-rules.pro)
- [Build Configuration](../app/build.gradle)
