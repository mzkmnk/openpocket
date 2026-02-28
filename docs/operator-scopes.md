# operator scopes 最小化メモ（調査）

## 結論（暫定）

- openpocket のMVPは **`operator.read` + `operator.write`** を基本にするのが最小。
- **ペアリング承認をアプリ内でやらない**前提なら、`operator.pairing` は必須ではない可能性が高い。
- `operator.approvals`（exec approval UI 用）は openpocket MVP では不要。
- `operator.admin` は Control UI が雑に要求しているだけの可能性があるため、**最小権限で実際にRPCが通るか**を PoC で確認して詰める。

## スコープ候補と用途

- `operator.read`
  - 読み取り系（sessions.list / chat.history 等）
- `operator.write`
  - 書き込み系（chat.send / chat.abort / sessions.patch? 等）
- `operator.pairing`
  - 端末ペアリングの管理（device.pair.* / device.token.*）
  - ※ openpocket から「Approve」までやるなら必要
- `operator.approvals`
  - exec approval を approve/deny する UI（exec.approval.resolve）
- `operator.admin`
  - 管理系（設定/ログ/チャンネルなど）。MVPでは不要寄り。

## MVP での運用提案

### 1) ペアリング承認は host 側（Control UI/CLI）

- openpocket は接続を試みる
- `PAIRING_REQUIRED` で弾かれたら「ホストで承認してね」と案内
- 承認は `openclaw devices approve ...` や Control UI の Devices 画面で行う
- 承認後、openpocket 再接続 → `hello-ok.auth.deviceToken` を受け取り保存

=> この運用なら openpocket に `operator.pairing` を付与しなくて良い可能性。

### 2) 将来：アプリ内で承認したい場合

- `operator.pairing` を付与
- Devices UI を作り、`device.pair.list/approve/reject` を叩く

## 確定のための検証（必須）

- scope を `operator.read/write` だけで connect して、以下が通るか確認
  - `sessions.list`
  - `chat.history`
  - `chat.send`
  - `chat.abort`
- もし 403/UNAUTHORIZED が出たら、必要 scope を1つずつ追加して最小集合を確定

