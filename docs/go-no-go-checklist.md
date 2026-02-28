# openpocket Go / No-Go チェックリスト（ここまでOKなら実装に進める）

このチェックを満たせば「openpocket のMVP開発に進める」判断ができるレベル、という基準。

## A. ネットワーク到達性（Tailnet限定）

- [ ] iOS/Android 端末が tailnet に参加できる（Tailscaleアプリ）
- [ ] 端末から Gateway に到達できる（推奨: Tailscale Serve 経由の HTTPS/WSS）
  - [ ] `wss://<magicdns>/...` で WebSocket が張れる
  - [ ] （代替）`ws://<tailnet-ip>:18789` 直結でもOK（ただしTLS無し）

## B. Gateway 接続（connect）

- [ ] `connect.challenge` を受け取れる
- [ ] challenge nonce を含む署名を作れる（Ed25519想定）
- [ ] `connect` が通る（token/password or deviceToken）
- [ ] `PAIRING_REQUIRED` の場合に「ペアリング承認が必要」とUIで案内できる

## C. Session 複数切替（要件(2)）

- [ ] `sessions.list` を呼び、一覧が取れる
- [ ] sessionKey 切替でチャット対象が切り替わる

## D. Chat（履歴・送信・ストリーム）

- [ ] `chat.history(sessionKey)` で履歴が取れる
- [ ] `chat.send(sessionKey, message, idempotencyKey)` が通る
- [ ] `event: "chat"` の `delta/final` でストリーム表示できる
- [ ] `chat.abort` が動く

## E. Expo/RN 上の暗号・鍵管理

- [ ] Expo managed で鍵生成/署名が実装できる（pure JS + expo-crypto など）
- [ ] 秘密鍵を secure storage に保存できる（expo-secure-store 等）
- [ ] 端末移行/リセット時の挙動（再ペアリング）が設計できる

## F. 最小スコープ（権限）

- [ ] operator scopes を最小セットで運用できる（原則: `operator.read` + `operator.write`）
- [ ] ペアリング承認は当面 Control UI/CLI で行う運用が成立する

