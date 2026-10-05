package com.clocklend.app.security

import android.app.KeyguardManager
import android.content.Context
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil

class SecurityModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "ClockLendSecurity"

    @ReactMethod
    fun getIntegrityStatus(promise: Promise) {
        try {
            val isEmulator = SecurityIntegrity.isEmulator(reactContext)
            val isRooted = SecurityIntegrity.isRooted()
            val isHooking = SecurityIntegrity.isHookingDetected()
            val isDebugger = SecurityIntegrity.isDebuggerAttached(reactContext, false)

            val map = Arguments.createMap().apply {
                putBoolean("isEmulator", isEmulator)
                putBoolean("isRooted", isRooted)
                putBoolean("isHooking", isHooking)
                putBoolean("isDebugger", isDebugger)
                putBoolean("isSecure", !isEmulator && !isRooted && !isHooking && !isDebugger)
            }
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("SECURITY_CHECK_ERROR", e.message, e)
        }
    }

    /**
     * Launch native Android device screen lock challenge (PIN, Pattern, Password).
     * Strictly uses DEVICE_CREDENTIAL only — no biometrics / fingerprint.
     */
    @ReactMethod
    fun authenticateDeviceLock(title: String, description: String, promise: Promise) {
        UiThreadUtil.runOnUiThread {
            try {
                val activity = reactContext.currentActivity as? FragmentActivity
                if (activity == null) {
                    promise.resolve(false)
                    return@runOnUiThread
                }

                val keyguardManager = reactContext.getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
                if (keyguardManager == null || !keyguardManager.isDeviceSecure) {
                    // Device has no PIN, Pattern, or Password configured — there
                    // is nothing to authenticate against, so the challenge FAILS.
                    // Resolving true here made the app lock a no-op on exactly the
                    // devices that need it most.
                    promise.resolve(false)
                    return@runOnUiThread
                }

                val executor = ContextCompat.getMainExecutor(activity)
                var resolved = false

                val callback = object : BiometricPrompt.AuthenticationCallback() {
                    override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                        super.onAuthenticationSucceeded(result)
                        if (!resolved) {
                            resolved = true
                            promise.resolve(true)
                        }
                    }

                    override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                        super.onAuthenticationError(errorCode, errString)
                        if (!resolved) {
                            resolved = true
                            // If user cancelled or pressed negative button
                            promise.resolve(false)
                        }
                    }

                    override fun onAuthenticationFailed() {
                        super.onAuthenticationFailed()
                        // One attempt failed; user can re-try inside prompt
                    }
                }

                val biometricPrompt = BiometricPrompt(activity, executor, callback)
                val promptInfo = BiometricPrompt.PromptInfo.Builder()
                    .setTitle(title)
                    .setDescription(description)
                    .setAllowedAuthenticators(BiometricManager.Authenticators.DEVICE_CREDENTIAL)
                    .build()

                biometricPrompt.authenticate(promptInfo)
            } catch (e: Exception) {
                promise.resolve(false)
            }
        }
    }

    @ReactMethod
    fun terminateApp() {
        android.os.Process.killProcess(android.os.Process.myPid())
    }
}
