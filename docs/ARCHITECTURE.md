# アーキテクチャ詳細設計

## ディレクトリ構成

```
src/
  app/                    # Next.js App Router
    (auth)/               # 認証関連ページ
      login/
      callback/
    (student)/            # 生徒用ページ
      study/              # 学習画面
      decks/              # デッキ一覧
      stats/              # 統計
    (teacher)/            # 講師用ページ
      dashboard/          # ダッシュボード
      decks/              # デッキ管理
      students/           # 生徒管理
    api/                  # API Routes
  components/
    ui/                   # 基本UIコンポーネント
    card/                 # カード表示・学習関連
    deck/                 # デッキ管理関連
    editor/               # ノート・テンプレート編集
  lib/
    supabase/             # Supabase client・型定義
      client.ts
      server.ts
      types.ts
    db/                   # Dexie.jsローカルDB
      schema.ts
      sync.ts
    srs/                  # SM-2アルゴリズム
      scheduler.ts
      types.ts
    sync/                 # オフライン同期ロジック
      conflict-resolver.ts
      queue.ts
    template/             # HTMLテンプレートレンダリング
      renderer.ts
      sanitizer.ts
  types/                  # 共通型定義
    index.ts
```

## データベース設計

### ユーザー・組織

```sql
-- Supabase Auth と連携
-- auth.users は Supabase が管理

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student', 'teacher', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,  -- 例: 高3理系
  teacher_id UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.class_members (
  class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (class_id, user_id)
);
```

### ノートタイプ・テンプレート

```sql
CREATE TABLE public.note_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID REFERENCES public.profiles(id),
  fields JSONB NOT NULL,  -- [{name: "Front", ord: 0}, {name: "Back", ord: 1}]
  is_system BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.card_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_type_id UUID NOT NULL REFERENCES public.note_types(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  front_template TEXT NOT NULL,  -- HTML with {{Field}} placeholders
  back_template TEXT NOT NULL,
  css TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### デッキ・ノート・カード

```sql
CREATE TABLE public.decks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES public.profiles(id),
  is_distributed BOOLEAN DEFAULT FALSE,
  parent_deck_id UUID REFERENCES public.decks(id),
  settings JSONB DEFAULT '{"new_cards_per_day": 20}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.deck_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id UUID NOT NULL REFERENCES public.decks(id) ON DELETE CASCADE,
  class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (
    (class_id IS NOT NULL AND user_id IS NULL) OR
    (class_id IS NULL AND user_id IS NOT NULL)
  )
);

CREATE TABLE public.notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id UUID NOT NULL REFERENCES public.decks(id) ON DELETE CASCADE,
  note_type_id UUID NOT NULL REFERENCES public.note_types(id),
  field_values JSONB NOT NULL,  -- {"Front": "apple", "Back": "りんご"}
  source_info JSONB,  -- {"book": "ターゲット1900", "unit": 3, "number": 142, "is_derivative": false}
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  deck_id UUID NOT NULL REFERENCES public.decks(id) ON DELETE CASCADE,
  template_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 学習記録（ユーザー個別）

```sql
CREATE TABLE public.card_states (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  due TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  interval INTEGER NOT NULL DEFAULT 0,  -- 日数
  ease_factor REAL NOT NULL DEFAULT 2.5,
  repetitions INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'new' CHECK (state IN ('new', 'learning', 'review', 'relearning')),
  learning_step INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, card_id)
);

CREATE TABLE public.review_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  ease INTEGER NOT NULL CHECK (ease BETWEEN 1 AND 4),  -- 1=Again, 2=Hard, 3=Good, 4=Easy
  interval INTEGER NOT NULL,
  last_interval INTEGER NOT NULL,
  time_ms INTEGER,  -- 回答にかかった時間
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synced_at TIMESTAMPTZ
);
```

### RLS ポリシー方針

```sql
-- profiles: 自分のみ読み書き、講師は担当生徒を読める
-- classes: 講師は自分のクラスのみ、生徒は所属クラスのみ
-- decks:
--   - 自分のデッキ: 読み書き
--   - 配布されたデッキ: 読み取りのみ
-- notes, cards: デッキの権限に従う
-- card_states, review_logs: 自分のもののみ
```

## ノートタイプ詳細

### Basic（英↔和）

```json
{
  "name": "Basic (and reversed card)",
  "fields": [
    {"name": "Front", "ord": 0},
    {"name": "Back", "ord": 1}
  ]
}
```

**Card Template 1 (Front → Back):**
```html
<!-- front_template -->
<div class="front">{{Front}}</div>

<!-- back_template -->
<div class="front">{{Front}}</div>
<hr>
<div class="back">{{Back}}</div>
```

**Card Template 2 (Back → Front):**
```html
<!-- front_template -->
<div class="front">{{Back}}</div>

<!-- back_template -->
<div class="front">{{Back}}</div>
<hr>
<div class="back">{{Front}}</div>
```

### Cloze（穴埋め）

```json
{
  "name": "Cloze",
  "fields": [
    {"name": "Text", "ord": 0},
    {"name": "Extra", "ord": 1}
  ]
}
```

**Cloze 記法:**
- `{{c1::answer}}` → 穴埋め
- `{{c1::answer::hint}}` → ヒント付き

## オフライン同期フロー

```
1. ユーザー操作
   ↓
2. Dexie.js (IndexedDB) に保存
   ↓
3. sync_queue にエントリ追加
   ↓
4. オンライン検知
   ↓
5. sync_queue を処理
   ↓
6. Supabase と比較
   ↓
7a. 競合なし → 同期完了
7b. 競合あり → ユーザーに選択肢提示
   ↓
8. 選択に基づいて解決
```

## 想定データ量

- 1デッキ: 最大約1万ノート
- CSVインポート: 最大1万行
- 生徒数: 40-50名
