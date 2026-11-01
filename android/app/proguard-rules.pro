# Ground OPS Tracker - ProGuard Rules

# ============= General Rules =============

# Keep annotations
-keepattributes *Annotation*,EnclosingMethod,Signature,InnerClasses,LineNumberTable,SourceFile

# Rename source file for error reporting
-renamesourcefileattribute SourceFile

# Keep line numbers for crash reporting
-keepattributes SourceFile,LineNumberTable

# ============= Application-Specific Rules =============

# Keep all Ground OPS classes
-keep class com.groundops.tracker.** { *; }
-keep interface com.groundops.tracker.** { *; }
-keepnames class com.groundops.tracker.**

# Keep activity names (required by Android)
-keepnames class * extends android.app.Activity
-keepnames class * extends android.app.Service
-keepnames class * extends android.content.BroadcastReceiver
-keepnames class * extends android.content.ContentProvider

# Keep view constructors (needed for XML inflation)
-keepclasseswithmembers class * {
    public <init>(android.content.Context, android.util.AttributeSet);
}

# ============= Firebase Rules =============

-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.**
-dontwarn java.lang.invoke.**

# ============= Capacitor Rules =============

-keep class com.getcapacitor.** { *; }
-keep interface com.getcapacitor.** { *; }
-dontwarn com.getcapacitor.**

# ============= Cordova Rules =============

-keep class org.apache.cordova.** { *; }
-keep interface org.apache.cordova.** { *; }
-dontwarn org.apache.cordova.**

# ============= Timber Logging =============

-keep class timber.log.Timber* { *; }
-keep class timber.log.Timber$DebugTree { *; }

# ============= BuildConfig =============

-keep class com.groundops.tracker.BuildConfig { *; }

# ============= Optimization Settings =============

# Verbose output
-verbose

# Optimization passes
-optimizationpasses 5
-dontusemixedcaseclassnames

# Class merging (can cause issues with reflection)
-allowaccessmodification
