---
date: 2026-06-19
tags: [rls, auth, sync]
phase:
slug: teacher-shared-decks
---

# 講師デッキは講師間で自動共有・共同編集にする

## 背景
講師が作ったデッキ・ノートを講師同士で共有したい（生徒には共有しない）。講師は少数。

## 決定
- **RLS**（`021_teacher_shared_decks.sql`・適用済み）: 既存 `is_teacher_or_admin()` を再利用し、decks/notes/cards/deck_assignments は「講師は講師所有のものを全操作可」。note_types/card_templates は「講師は閲覧のみ」（構造破壊回避で編集はオーナーのみ）
- **サーバー権限**: `canManageDeck(supabase, userId, deckOwnerId)` ＝ 自分 or（自分が講師 かつ 所有者も講師）。各 API の `owner_id !== user.id` 判定を一括置換
- **pull API**: 講師には admin client で他講師の全デッキ＋ノートタイプ＋テンプレを配信

## 結果
講師同士で閲覧/編集/削除/配布が可能（実機確認済み）。ただし全講師が全講師デッキを pull するため同期は重め（中学英単語6858 等）。将来重ければ共有対象フラグや遅延ロードを検討。
