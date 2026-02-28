# Expo/RN での device identity（鍵生成・署名・保存）実装可否メモ

## 結論（MVP判断用）

- **可能性は高い**（Expo managed でも実装できる見込み）。
- 理由: OpenClaw Control UI（Web版）もブラウザ環境で **Ed25519 署名 + localStorage** 相当を実装している。
- openpocket では
  - 署名（Ed25519）
  - 乱数（CSPRNG）
  - 秘密鍵の安全な保存（Keychain/Keystore）
  を Expo の標準モジュール + pure JS crypto で組める可能性が高い。

## 推奨スタック（案）

- 署名: `@noble/ed25519`（pure JS）
  - 目的: `connect.challenge` の nonce を含むペイロードに署名
- 乱数: `expo-crypto` の random bytes（CSPRNG）
- 保存: `expo-secure-store`
  - 秘密鍵（seed/privateKey）と deviceToken を格納

※ いずれも Expo managed の範囲で完結する構成を優先。

## 保存するもの（最低限）

- `deviceId`
- `publicKey`
- `privateKey`（secure store）
- `deviceToken`（secure store）

端末初期化や機種変更で privateKey が消えると `deviceId` が変わるため、
再ペアリングが必要になる。これは仕様として許容しやすい。

## リスク / 注意

- JS暗号実装のパフォーマンス（低スペック端末での署名負荷）
- Expo の secure store 制約（バックアップ挙動、ロック状態、biometrics設定）
- バイナリ/BASE64 変換、エンコーディングの取り扱いミス

## MVPとしての検証タスク（最小）

- [ ] Expo で Ed25519 keypair を生成し、永続化して復元できる
- [ ] 任意文字列（OpenClawの challenge 署名対象）を署名できる
- [ ] 署名結果（base64等）をサーバ側で検証できる（必要なら）
- [ ] deviceToken を保存して再接続に利用できる

## 参考（実装のヒント）

OpenClaw Control UI は WebCrypto がある環境では、
- device identity を生成・保存
- challenge payload を Ed25519 で署名
- `hello-ok` の `auth.deviceToken` を保存
という流れを取っている（ブラウザ実装）。

