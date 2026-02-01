---
name: db-schema
description: データベーススキーマの詳細参照。テーブル構造、リレーション、RLSポリシーを確認する際に使用。
---

# データベーススキーマ参照

このスキルはデータベース操作時に参照してください。

詳細なスキーマは @docs/ARCHITECTURE.md の「データベース設計」セクションを参照。

## テーブル一覧

| テーブル | 説明 |
|---------|------|
| profiles | ユーザープロフィール（auth.usersと連携） |
| classes | クラス |
| class_members | クラスメンバー |
| note_types | ノートタイプ定義 |
| card_templates | カードテンプレート |
| decks | デッキ |
| deck_assignments | デッキ配布先 |
| notes | ノート |
| cards | カード |
| card_states | カードのSRS状態（ユーザー別） |
| review_logs | 復習ログ |

## よく使うクエリパターン

### 今日の復習カード取得
```sql
SELECT c.*, cs.*
FROM cards c
JOIN card_states cs ON c.id = cs.card_id
WHERE cs.user_id = $1
  AND cs.due <= NOW()
  AND cs.state IN ('review', 'relearning')
ORDER BY cs.due ASC;
```

### デッキのカード数取得
```sql
SELECT
  d.id,
  d.name,
  COUNT(c.id) as total_cards,
  COUNT(CASE WHEN cs.state = 'new' THEN 1 END) as new_cards,
  COUNT(CASE WHEN cs.due <= NOW() THEN 1 END) as due_cards
FROM decks d
LEFT JOIN cards c ON d.id = c.deck_id
LEFT JOIN card_states cs ON c.id = cs.card_id AND cs.user_id = $1
WHERE d.owner_id = $1 OR d.id IN (
  SELECT deck_id FROM deck_assignments
  WHERE user_id = $1 OR class_id IN (
    SELECT class_id FROM class_members WHERE user_id = $1
  )
)
GROUP BY d.id;
```

## RLSポリシー実装

### profiles
```sql
-- 自分のプロフィールのみ更新可
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- 講師は担当生徒のプロフィールを閲覧可
CREATE POLICY "Teachers can view their students"
  ON profiles FOR SELECT
  USING (
    auth.uid() = id OR
    EXISTS (
      SELECT 1 FROM class_members cm
      JOIN classes c ON cm.class_id = c.id
      WHERE cm.user_id = profiles.id AND c.teacher_id = auth.uid()
    )
  );
```

### card_states / review_logs
```sql
-- 自分のデータのみアクセス可
CREATE POLICY "Users can manage own card states"
  ON card_states FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own review logs"
  ON review_logs FOR ALL
  USING (auth.uid() = user_id);
```
