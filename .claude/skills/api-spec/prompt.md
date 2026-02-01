---
name: api-spec
description: API仕様の参照。エンドポイント実装時に使用。
---

# API 仕様

## 認証

すべてのAPIは Supabase Auth で認証。
Authorization ヘッダーに Bearer トークンを含める。

## エンドポイント一覧

### 認証
| Method | Path | 説明 |
|--------|------|------|
| POST | /auth/callback | OAuth コールバック |

### デッキ
| Method | Path | 説明 |
|--------|------|------|
| GET | /api/decks | デッキ一覧取得 |
| POST | /api/decks | デッキ作成 |
| GET | /api/decks/[id] | デッキ詳細 |
| PUT | /api/decks/[id] | デッキ更新 |
| DELETE | /api/decks/[id] | デッキ削除 |
| POST | /api/decks/[id]/assign | デッキ配布 |

### ノート
| Method | Path | 説明 |
|--------|------|------|
| GET | /api/decks/[id]/notes | ノート一覧 |
| POST | /api/decks/[id]/notes | ノート作成 |
| PUT | /api/notes/[id] | ノート更新 |
| DELETE | /api/notes/[id] | ノート削除 |

### 学習
| Method | Path | 説明 |
|--------|------|------|
| GET | /api/study/[deckId] | 学習カード取得 |
| POST | /api/study/answer | 回答送信 |

### インポート
| Method | Path | 説明 |
|--------|------|------|
| POST | /api/import/csv | CSVインポート |

### 講師用
| Method | Path | 説明 |
|--------|------|------|
| GET | /api/teacher/students | 担当生徒一覧 |
| GET | /api/teacher/students/[id]/progress | 生徒の進捗 |

## リクエスト/レスポンス例

### GET /api/study/[deckId]
```json
// Response
{
  "cards": [
    {
      "id": "uuid",
      "front": "<div>apple</div>",
      "back": "<div>apple</div><hr><div>りんご</div>",
      "state": "review",
      "due": "2024-01-15T04:00:00Z"
    }
  ],
  "counts": {
    "new": 5,
    "learning": 3,
    "review": 12
  }
}
```

### POST /api/study/answer
```json
// Request
{
  "cardId": "uuid",
  "ease": 3,
  "timeMs": 5200
}

// Response
{
  "nextDue": "2024-01-18T04:00:00Z",
  "interval": 3,
  "easeFactor": 2.5
}
```

### POST /api/import/csv
```json
// Request (multipart/form-data)
{
  "file": <CSV file>,
  "deckId": "uuid",
  "noteTypeId": "uuid",
  "mapping": {
    "Front": 0,  // CSV column index
    "Back": 1
  }
}

// Response
{
  "imported": 150,
  "skipped": 2,
  "errors": [
    {"row": 45, "message": "Missing required field: Front"}
  ]
}
```

## エラーレスポンス

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "認証が必要です"
  }
}
```

| Code | HTTP Status | 説明 |
|------|-------------|------|
| UNAUTHORIZED | 401 | 認証エラー |
| FORBIDDEN | 403 | 権限エラー |
| NOT_FOUND | 404 | リソースなし |
| VALIDATION_ERROR | 400 | バリデーションエラー |
| INTERNAL_ERROR | 500 | サーバーエラー |
