# Face Authentication Investigation (Expo)

## Current implementation status

- The app already uses `expo-local-authentication` at startup (`AuthGateScreen`).
- It currently calls `authenticateAsync` with only `promptMessage` and `cancelLabel`.
- With default behavior, the OS can fall back to device credentials (passcode/PIN/pattern), so users may see passcode authentication instead of biometric-only flow.

Relevant source:

- `src/screens/auth/AuthGateScreen.tsx`
- `app.json` (`NSFaceIDUsageDescription` is already configured for iOS)

## Can we switch to Face ID / biometric-focused flow?

Yes, this is feasible in Expo.

### iOS

Use `disableDeviceFallback: true` in `LocalAuthentication.authenticateAsync`.

- This changes policy from device-owner authentication (biometric + passcode fallback) to biometric-only policy.
- If biometric authentication fails too many times, the app should handle the error and provide custom fallback UX.

Also, if you want to hide the passcode fallback button text in prompt, `fallbackLabel: ""` can be used (iOS).

### Android

Android cannot be guaranteed as “face only” universally via Expo API.

What can be controlled:

- `biometricsSecurityLevel: "strong"` to require stronger biometric class.
- `supportedAuthenticationTypesAsync()` can detect available modality (fingerprint/face/iris), but forcing only one modality is generally not portable across all devices/OEM implementations.

So in practical terms:

- iOS: biometric-only can be strongly controlled.
- Android: biometric-only (vs PIN fallback) can be guided, but strict “face-only” is not consistently enforceable across devices.

## Recommended rollout plan

1. Add a feature flag/config for authentication mode:
   - `biometric_with_device_fallback` (current)
   - `biometric_only`
2. In `biometric_only` mode, set:
   - `disableDeviceFallback: true`
   - (optional iOS) `fallbackLabel: ""`
   - (optional Android) `biometricsSecurityLevel: "strong"`
3. Before prompt, call:
   - `hasHardwareAsync`
   - `isEnrolledAsync`
   - `supportedAuthenticationTypesAsync`
   and branch UX if facial recognition is unavailable.
4. Add error handling for `lockout`, `not_enrolled`, `user_cancel`, etc., and provide explicit recovery UX.
5. QA matrix:
   - iOS with Face ID enabled/disabled
   - Android with face unlock only / fingerprint only / both / none

## Risks and notes

- Users without enrolled biometrics may be blocked in biometric-only mode unless a separate app-level fallback path is implemented.
- Android behavior varies by manufacturer and OS version.
- You should define product policy clearly:
  - strict biometric-only,
  - face-preferred with fallback,
  - or device-credential-allowed.

## Suggested next step

If desired, next implementation patch can:

- Introduce `biometric_only` mode in `AuthGateScreen`.
- Add modality detection and user-facing message when facial recognition is not available.
- Keep a temporary kill-switch (config/env) to return to current fallback behavior.
