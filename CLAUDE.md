# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

**つばめSRS** - 塾（つばめ学習舎）向けのWeb版SRS学習アプリ
- コンセプト: **Web版Anki + 塾向け講師機能**
- 生徒数: 約40-50名
- デバイス: スマホ・タブレット中心

## 技術スタック

- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Backend**: Supabase（認証・PostgreSQL・ストレージ）
- **Offline**: Dexie.js（IndexedDB）
- **Hosting**: Vercel
- **Auth**: Googleログイン

## 開発コマンド

```bash
npm run dev          # 開発サーバー (localhost:3000)
npm run build        # プロダクションビルド
npm run lint         # ESLint
npm run test         # Vitest 実行
npm run test:watch   # Vitest 監視モード
```

## 開発環境

- **Supabase**: クラウドのみ（ローカルDocker不使用）
- **テスト**: Vitest

## コア設計方針

### SRS
- SM-2アルゴリズム
- 1日の区切り: 午前4時
- Anki方式で1日N枚の新規カード自動導入

### データ同期
- オフラインファースト（Dexie.js → Supabase）
- 競合時: AnkiWeb方式（ユーザーが選択）

### ノートタイプ
- Anki互換（HTML/CSSテンプレート）
- Phase 1: Basic（英↔和）、Cloze（穴埋め）

### デッキ権限
- 配布デッキ: 講師が管理
- 個人デッキ: 生徒が自由作成

### セキュリティ
- HTMLテンプレート: サニタイズ必須

## LLM連携（Phase 4）

- **TTS**: 単語・例文の音声生成（OpenAI TTS） ✅ 完了
- **例文生成**: 単語から例文・コロケーション自動生成（Claude API） ✅ 完了
- **OCR**: 単語帳写真→テキスト抽出（Claude Vision）- 未実装

## 現在の進捗（2026-02-03更新）

**Phase 4.2 例文生成 完了**

### 次回セッションでやること
1. **Supabaseで手動実行**: `supabase/migrations/005_generated_content.sql`
2. **環境変数設定**: `.env.local` に `ANTHROPIC_API_KEY=sk-ant-...` を追加
3. **動作確認**: デッキ詳細ページで「例文を一括生成」ボタンをテスト
4. **動作確認**: 学習画面で生成された例文が表示されることを確認

### 今回追加したファイル
- `src/app/api/generate-examples/route.ts` - Claude API例文生成エンドポイント
- `src/components/ai/ExampleGenerator.tsx` - 個別・一括生成UIコンポーネント
- `supabase/migrations/005_generated_content.sql` - notes.generated_content列追加

### 今回変更したファイル
- `src/types/database.ts` - GeneratedContent型追加
- `src/app/(student)/decks/[id]/DeckDetailClient.tsx` - 一括生成ボタン追加
- `src/components/card/StudyCard.tsx` - 例文表示追加
- `src/components/card/StudySession.tsx` - generatedContent対応

## 参照ドキュメント

- @docs/ARCHITECTURE.md - 詳細設計・DB スキーマ
- @docs/ROADMAP.md - 開発ロードマップ

## セッション終了時のルール

- **必ずコミット・プッシュする**: セッション終了前に未コミットの変更がある場合は、コミットしてGitHubにプッシュすること
- コミットメッセージは変更内容を簡潔に説明する

## 禁止事項

- `dangerouslySetInnerHTML` を未サニタイズで使用しない
- Supabase RLS をバイパスするクエリを書かない
- 同期処理で `updated_at` を無視しない
