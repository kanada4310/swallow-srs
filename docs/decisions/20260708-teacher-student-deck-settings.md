---
date: 2026-07-08
tags: [rls, srs, ui-ux, scheduling]
phase:
slug: teacher-student-deck-settings
---

# 配布デッキの学習設定は講師が生徒ごとに上書きできる（user_deck_settings 共有）

## 背景
user_deck_settings（012）は生徒本人の個人オーバーライド用で、RLS が「本人のみ」だった。塾運用では「この生徒は新規を減らす」等を講師側から調整したい。

## 決定
1. **同じ user_deck_settings 行を講師と生徒で共有し、後から書いた方が勝つ**（経営判断: ロック機構は作らない。運用の指導で足りる）
2. RLS は `is_student_of_teacher(user_id, auth.uid())`（016版=billing連携クラス対応）で**担当生徒の行のみ**講師に開放（023）。`is_teacher_or_admin()` での全開放はしない＝講師が他講師個人の設定行を触れない
3. 新 API `/api/teacher/student-deck-settings`（GET/PUT/DELETE）。**deckId は必ずサーバー側でルートデッキに解決**して読み書きする（学習時のマージキーが `${userId}:${rootDeckId}` のため）。DELETE=「既定に戻す」リセット
4. UI は生徒詳細（/students/progress/[userId]）のデッキ別進捗の**ルートデッキ行のみ**に⚙。既存 DeckAdvancedSettings をモーダルで再利用
5. 反映は生徒側の**次回 pull**（pull は本人の user_deck_settings を毎回全件取得済み・push 経路なし＝競合はサーバー後勝ちで収束）

## 結果
- 上書きは JSON 丸ごと（既存挙動と同じ）。講師が保存した後にデッキ既定を変えてもその生徒には届かない → 「既定に戻す」で解消
- ついで修正: 非オーナーがデッキ詳細（サブデッキ）で学習設定を保存すると**サブデッキIDで保存され学習時に読まれない**既存バグを、読み書きともルートIDキーに統一して解消
