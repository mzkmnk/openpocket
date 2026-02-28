# openpocket

OpenClaw を **Tailnet（Tailscale）接続端末のみ** から安全に利用するためのモバイルクライアントです。

## 言語

- English: [README.md](README.md)
- 日本語: このファイル

## 概要

openpocket は、チャットプラットフォームに依存せず OpenClaw を操作するための専用モバイル UI を提供します。
WebSocket 経由で OpenClaw Gateway に接続し、セッション単位の運用を中心に設計されています。

## 主な機能

- Tailnet 限定アクセスモデル（Tailscale ネットワーク境界）
- トークン接続と認証情報のセキュア保存
- デバイス ID 生成と challenge-response 認証
- ペアリング成功後の device token 永続化
- 起動時の生体認証（モバイル、任意）
- 保存済み認証情報による自動ログイン判定
- 接続状態の可視化（connecting / connected / reconnecting / error）
- セッション一覧の検索、pin/unpin、recent/pinned フィルタ
- アプリ内でのセッションラベル編集
- セッション単位のチャット履歴読み込み
- リアルタイムのチャットストリーミング（`delta` / `final` / `aborted` / `error`）
- 実行中チャットへの送信・中断操作
- Gateway クライアントの自動再接続サポート

## ステータス

- 主要機能は概ね実装済みで、実利用できる状態です。
- 現在は仕上げ、安定化、UX 改善を中心に進めています。

## 開発情報

- 技術スタック: React Native (Expo) + TypeScript
- 接続先: OpenClaw Gateway（WebSocket プロトコル）

## ライセンス

TBD（private）
