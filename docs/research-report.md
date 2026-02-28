# openpocket 技術調査レポート（MVPに必須なもの）

作成日: 2026-02-28

## 1. 結論

- **実現可能**。
- openpocket（RN/Expo）を OpenClaw Gateway に **WebSocket operator クライアント**として接続する構成が最短。
- 「session 複数切替」の要件は `sessions.list` + `chat.*` により満たせる。
- セキュリティは
  - **Tailnet で閉域**（Tailscale）
  - **Gateway 認証（token/password）**
  - **端末ペアリング（device identity + device token）**
 で多層にできる。

## 2. 調査対象と成果物

- 調査対象: Gateway WS の operator 向け最小 API（session list / message send / stream events）
- 成果物:
  - `docs/protocol-notes.md` に、MVPで必要な WS メソッド/イベントを整理

## 3. openpocket が実装上「不可欠」になる要素

### 3.1 ネットワーク構成（Tailnet 限定）

必須:
- iOS/Android 端末が tailnet 参加（Tailscale app）
- Gateway が tailnet から到達できる

推奨:
- Gateway を loopback bind のまま **Tailscale Serve** で tailnet HTTPS/WSS 化

理由:
- Gateway を tailnet IP に直接 bind しなくてもよく、露出面が小さい
- モバイル側で HTTPS/WSS を扱いやすい

### 3.2 認証・端末識別

必須:
- Gateway 側 auth（token or password）
- クライアントが `connect.challenge` に応答し、device identity 付きで `connect` を送れること

推奨:
- 初回承認後に返る **deviceToken** を secure storage に保存し、以後は deviceToken を優先

実装上の論点:
- RN での Ed25519 署名/鍵管理（ライブラリ選定）
- Secure storage（Keychain/Keystore）

### 3.3 セッション切替（要件(2)）

必須:
- `sessions.list` を叩いて一覧表示
- sessionKey を UI で切替

補助:
- session の label 編集（`sessions.patch`）

### 3.4 チャット（送信・履歴・ストリーム）

必須:
- `chat.history` で履歴ロード
- `chat.send` で送信（idempotencyKey/runId で紐づけ）
- `event(chat)` を購読して delta/final を描画（ストリーミング）
- `chat.abort` で停止

### 3.5 UX に直結する必須（Discord代替として）

- メッセージ/コードブロックの **コピーボタン**
- ストリーミング中の表示（途中経過を見たい）
- 接続状態（reconnect/backoff）の見える化

## 4. 今後の調査/決めごと（次フェーズ）

- operator scopes を最小化（admin/pairing が本当に必須か）
- iOS/Android での署名ライブラリ（expo managed で使えるか）
- Gateway URL 形式（Serve/直bind）と証明書ピンニング方針
- 「端末ペアリング承認をアプリ内でやるか」or「最初はControl UI/CLIで承認するか」

## 5. 参考

- `docs/protocol-notes.md`

