# openpocket

OpenClaw を **Tailnet（Tailscale）接続された端末のみ** から安全に利用するための、モバイル向けクライアントアプリ。

- Tech: React Native (Expo) + TypeScript
- Network: Tailscale (tailnet only)
- Target: OpenClaw Gateway (WebSocket protocol)

## Goals

- Discord の代替として、モバイルで使いやすい **OpenClaw 専用 UI** を提供する
- OpenClaw の **session を複数切り替え**できる「本格クライアント」
- Tailnet 内の許可端末のみがアクセスできる（ペアリング/トークン/鍵を前提）

## Non-Goals

- Discord 相当の巨大な機能セット（権限管理、サーバ運用、ボットエコシステム等）は追わない

## Docs

- 仕様書: [docs/spec.md](docs/spec.md)

## License

TBD (private)
