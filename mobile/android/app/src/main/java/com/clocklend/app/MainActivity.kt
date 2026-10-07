package com.clocklend.app

import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import androidx.appcompat.app.AlertDialog
import com.clocklend.app.security.SecurityIntegrity

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // Set the theme to AppTheme BEFORE onCreate to support
    // coloring the background, status bar, and navigation bar.
    // This is required for expo-splash-screen.
    setTheme(R.style.AppTheme);

    // Defense-in-Depth: Prevent screenshots, screen recording, and task switcher
    // snapshots across release builds.
    //
    // DEMO_MODE (opt in with `./gradlew assembleRelease -PdemoMode`) clears it
    // instead, so the app can be shown on a screen share. Without that, the app
    // is a black rectangle to everyone on the call - which is precisely what a
    // demo cannot survive. Cleared explicitly rather than merely not-set, so a
    // theme or a previous activity cannot leave it on.
    if (BuildConfig.DEMO_MODE) {
      window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
    } else if (!BuildConfig.DEBUG) {
      window.setFlags(
        WindowManager.LayoutParams.FLAG_SECURE,
        WindowManager.LayoutParams.FLAG_SECURE
      )
    }

    // Check device environment integrity (Anti-Emulator, Anti-Root, Anti-Frida)
    val isEmulator = SecurityIntegrity.isEmulator(this)
    val isRooted = SecurityIntegrity.isRooted()
    val isHooking = SecurityIntegrity.isHookingDetected()
    val isDebugger = SecurityIntegrity.isDebuggerAttached(this, !BuildConfig.DEBUG)

    // Skipped entirely in DEMO_MODE. An emulator is the ordinary way to present
    // the app on a call, and this gate exits before there is anything to show.
    if (!BuildConfig.DEMO_MODE &&
        (isEmulator || isRooted || isHooking || (isDebugger && !BuildConfig.DEBUG))) {
      super.onCreate(null)
      val reason = when {
        isEmulator -> "Virtualized Environment (Emulator / Simulator) Detected."
        isRooted -> "Compromised Operating System (Root / Jailbreak) Detected."
        isHooking -> "Dynamic Instrumentation (Frida / Hooking) Detected."
        else -> "Unauthorized Debugger Attached."
      }
      AlertDialog.Builder(this)
        .setTitle("ClockLend Security Alert")
        .setMessage("$reason\n\nClockLend enforces strict hardware security to protect Solana private keys and escrow assets. Execution is restricted to verified physical devices.")
        .setCancelable(false)
        .setPositiveButton("Exit") { _, _ ->
          finishAffinity()
          kotlin.system.exitProcess(0)
        }
        .show()
      return
    }

    super.onCreate(null)
  }

  override fun onResume() {
    super.onResume()
    // Re-assert FLAG_SECURE on resume to guarantee screen shielding in release -
    // or keep it cleared for the whole session in DEMO_MODE, since resuming from
    // the recents switcher must not re-arm the shield mid-demo.
    if (BuildConfig.DEMO_MODE) {
      window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
    } else if (!BuildConfig.DEBUG) {
      window.setFlags(
        WindowManager.LayoutParams.FLAG_SECURE,
        WindowManager.LayoutParams.FLAG_SECURE
      )
    }
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "main"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          object : DefaultReactActivityDelegate(
              this,
              mainComponentName,
              fabricEnabled
          ){})
  }

  /**
    * Align the back button behavior with Android S
    * where moving root activities to background instead of finishing activities.
    * @see <a href="https://developer.android.com/reference/android/app/Activity#onBackPressed()">onBackPressed</a>
    */
  override fun invokeDefaultOnBackPressed() {
      if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
          if (!moveTaskToBack(false)) {
              // For non-root activities, use the default implementation to finish them.
              super.invokeDefaultOnBackPressed()
          }
          return
      }

      // Use the default back button implementation on Android S
      // because it's doing more than [Activity.moveTaskToBack] in fact.
      super.invokeDefaultOnBackPressed()
  }
}
