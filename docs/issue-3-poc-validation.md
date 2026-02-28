# Issue #3 PoC validation plan

## Scope covered in app

- Gateway connect (`connect.challenge` -> `connect` -> `hello-ok`)
- Session list + switch (`sessions.list`)
- Chat history (`chat.history`)
- Chat send (`chat.send` with `idempotencyKey`)
- Stream event handling (`event=chat`, `delta/final/aborted/error`)
- Abort (`chat.abort`)
- Markdown rendering (fenced code block)
- Code block copy button
- Connection status (`connecting/connected/reconnecting/error/disconnected`)

## Manual verification checklist

1. Launch app and input `wss://<gateway>/` and token/password.
2. Tap `Connect (challenge/hello)`.
3. Confirm `status: connected` and log `connect -> hello-ok`.
4. Tap `Reload` in Sessions and verify session list appears.
5. Select a session and confirm history is loaded.
6. Send a message and verify:
   - user message appears immediately
   - `idempotencyKey` appears in waiting indicator/log
   - streaming assistant text updates via `delta`
   - final assistant message is committed on `final`
7. Tap `Abort` during streaming and verify stream is stopped and logged.
8. Confirm fenced code block is rendered with `Copy` button and copied text is available in clipboard.
9. Disconnect network or stop gateway and verify `reconnecting` status appears.

## Notes

- Device identity is persisted in SecureStore on native and localStorage on web.
- `auth.deviceToken` returned from hello payload is persisted and reused.
- If gateway returns `PAIRING_REQUIRED`, the UI surfaces the error in status/log.
