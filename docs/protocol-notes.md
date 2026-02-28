# Gateway WS: openpocket が最低限必要とする API（調査メモ）

このドキュメントは **OpenClaw Control UI の実装（dist/control-ui）** を手掛かりに、
openpocket（モバイル operator クライアント）が MVP で必要とする Gateway WS API を洗い出したメモ。

> 注意: ここに書いている payload の細部は将来変わり得る。最終的には protocol schema を参照して実装する。

## 1. Transport / framing

- WebSocket（text frame JSON）
- フレーム種別
  - Request: `{ type: "req", id, method, params }`
  - Response: `{ type: "res", id, ok, payload | error }`
  - Event: `{ type: "event", event, payload, seq?, stateVersion? }`

## 2. Handshake（connect.challenge → connect）

1) Gateway → Client

- event: `connect.challenge`
- payload: `{ nonce: string, ts: number }`

2) Client → Gateway

- method: `connect`
- params（概略）
  - `minProtocol: 3, maxProtocol: 3`
  - `client: { id, version, platform, mode, instanceId? }`
  - `role: "operator"`
  - `scopes: string[]`
  - `auth: { token?: string, password?: string }`（設定による）
  - `device: { id, publicKey, signature, signedAt, nonce }`（secure context で device identity 必須）

3) Gateway → Client

- `hello-ok`（res payload）
- ここで `auth.deviceToken` が返る場合がある（初回ペアリング後など）

### operator scopes（Control UI が使っている例）

Control UI は operator として以下を要求している例がある：

- `operator.admin`
- `operator.approvals`
- `operator.pairing`

openpocket では最小化のため、実際に必要な scope を詰める（例: read/write のみ、pairing だけ等）。

## 3. Session 一覧 / 切替

### sessions.list

- method: `sessions.list`
- params（例）
  - `limit?: number`
  - `activeMinutes?: number`
  - `includeGlobal?: boolean`
  - `includeUnknown?: boolean`

用途:
- Session 一覧表示
- 最近使った session の復元

### sessions.patch

- method: `sessions.patch`
- params（例）
  - `key: string`
  - `label?: string | null`
  - `thinkingLevel?: string | null`
  - `verboseLevel?: string | null`
  - `reasoningLevel?: string | null`

用途:
- session のラベル付け
- session ごとの思考/出力設定の変更

### sessions.delete

- method: `sessions.delete`
- params（例）
  - `key: string`
  - `deleteTranscript?: boolean`

用途:
- 不要 session の削除（MVPで要否は要検討）

## 4. Chat（履歴、送信、ストリーム、abort）

### chat.history

- method: `chat.history`
- params（例）
  - `sessionKey: string`
  - `limit: number`（Control UI は 200 を使用）

戻り値（例）
- `messages: []`
- `thinkingLevel?: string`

### chat.send

- method: `chat.send`
- params（例）
  - `sessionKey: string`
  - `message: string`
  - `deliver?: boolean`（Control UI は `false`。= messaging へは投げない）
  - `idempotencyKey: string`（クライアント生成 UUID）
  - `attachments?: [{ type: "image", mimeType, content(base64) }]`

用途:
- 送信（テキスト + 画像添付）
- `idempotencyKey` を `runId` として扱い、イベントと紐づける

### chat.abort

- method: `chat.abort`
- params（例）
  - `sessionKey: string`
  - `runId?: string`

用途:
- 実行中のストリーム停止

## 5. Stream event（event = "chat"）

Gateway から `event: "chat"` が飛び、payload が stream 状態を含む。

- event: `chat`
- payload（概略）
  - `sessionKey: string`
  - `runId?: string`
  - `state: "delta" | "final" | "aborted" | "error"`
  - `message?: object`（assistant message）
  - `errorMessage?: string`

クライアント側の扱い（Control UI の挙動）
- `state=delta`
  - `message` からテキストを抽出し、現在のストリーム表示を更新
- `state=final`
  - `message` を messages に append / stream をクリア
- `state=aborted`
  - 最後の message を append するか、stream の内容を message 化して確定
- `state=error`
  - stream をクリアしてエラー表示

## 6. デバイスペアリング（必要になったら）

Control UI では以下のイベント/メソッドも存在する：

- `device.pair.list` / `device.pair.approve` / `device.pair.reject`
- `device.token.rotate` / `device.token.revoke`
- イベント: `device.pair.requested`, `device.pair.resolved`

openpocket の MVP では「初回ペアリングが通る」導線は必要。
ただし “承認” 自体は Gateway host 側（Control UI/CLI）で行う運用でも成立する。

## 7. openpocket MVP における「必須」まとめ

- connect（challenge + device signature + token/password or deviceToken）
- sessions.list（一覧・切替 UI のため）
- chat.history（選択 session のロード）
- chat.send（送信）
- event(chat) の購読（ストリーム表示）
- chat.abort（停止ボタン）

