---
date: 2026-07-07
tags: [convention]
phase:
slug: ops-rules-cms
---

# 開発運用ルールを CMS 方式に揃える

## 背景
progress.md が 1 ファイルに全履歴を積み上げて肥大化（約 595 行）し、毎セッションの読み込みが重く見通しも悪かった。姉妹プロジェクト CMS（`repos/CMS`）には、非技術者ユーザー向けの「コミュニケーションルール」と、進捗・技術判断を軽く保つ運用ルールが整備されている。

## 決定
CMS の運用ルールをつばめSRSへ移植する:
- **コミュニケーションルール**を CLAUDE.md 冒頭に明文化（日本語のみ・専門用語回避・結論ファースト・論点3つまで・推奨案を先頭・事前承認が必要な操作）
- **進捗の分割**: progress.md は「索引＋現在地＋最新ハンドオフへのリンク」に限定。セッション履歴は `docs/progress/handoff-YYYY-MM-DD.md`、古い分は `docs/progress/archive-*.md`
- **ADR（技術判断ログ）**: `docs/decisions/YYYYMMDD-<slug>.md` ＋ 索引 `docs/decisions.md`（`scripts/regenerate-decisions-index.mjs` で再生成）
- **/check コマンド**: 型・Lint・テストを一括点検（`.claude/commands/check.md`）

## 結果
- progress.md が約 55 行に圧縮。過去分は `docs/progress/archive-2026.md` に退避（削除ではない）
- 以後の end-session はハンドオフを個別ファイルで作成する
