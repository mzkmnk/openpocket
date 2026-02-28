# openpocket 仕様（ドラフト）

## 0. 用語

- **Gateway**: OpenClaw Gateway（WS + HTTP を同一ポートで提供）
- **Operator**: Gateway に接続する操作クライアント（このアプリ）
- **Session**: OpenClaw の会話/実行コンテキスト
- **Tailnet**: Tailscale のプライベートネットワーク

## 1. 目的

Discord 上で行っている OpenClaw との対話/開発フローを、
スマホでも扱いやすい専用アプリに移す。

- コピペ/履歴/UI を「開発向け」に最適化
- 余計なソーシャル機能は持たない

## 2. 前提

- 端末には Tailscale がインストール済み
- OpenClaw Gateway は tailnet から到達可能（次のどちらか）
  - (推奨) Gateway は loopback bind のまま **Tailscale Serve** 経由で公開
  - または Gateway を tailnet IP に bind
- 認証は token/password + 端末ペアリング（デバイストークン発行）

## 3. スコープ（MVP）

### 3.1 アカウント/接続

- Gateway URL 設定（MagicDNS / https://<name>/ など）
- 認証情報の投入（初期は token/password、将来的に device token）
- 初回接続時のペアリング承認フロー
- 接続状態表示（connected/disconnected/reconnecting）

### 3.2 セッション管理（(2) の要件）

- session 一覧表示
- session 切替
- session 新規作成（必要なら）
- session の要約/タイトル表示（可能なら）

### 3.3 チャットUI

- メッセージ送信（テキスト）
- 応答のストリーミング表示
- コードブロック/ログの表示最適化
- Copy ボタン（コードブロック単位など）

## 4. 将来スコープ

- Push 通知（重要イベント、完了通知）
- ノード機能（camera/screen/location 等）を必要に応じて
- Supabase（設定同期、端末間同期、ログ保管）

## 5. セキュリティ方針（案）

- ネットワーク境界: Tailnet のみ
- Gateway: token/password もしくは Serve + identity header（要検討）
- 端末識別: 鍵ペア（Ed25519 等）を生成し challenge に署名
- 秘密情報の保存: OS の secure storage（Keychain/Keystore）
- ペアリング: 初回承認後に device token を保存し再利用

## 6. 実装方針（案）

- React Native: Expo（Managed）を第一候補
- WS クライアント: reconnect + backoff
- 状態管理: zod + zustand (or jotai) など軽量で
- UI: React Native Paper / Tamagui / NativeWind から検討

## 7. 不確定事項（調査タスク）

- Gateway WS プロトコルの operator 向け最小 API（session list / message send / stream events）
- RN での署名実装（tweetnacl / noble など）
- Tailscale Serve 構成での接続 URL（wss/https）と証明書ピンニング要否
