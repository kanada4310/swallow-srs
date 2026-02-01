---
name: csv-import
description: CSVインポート機能の仕様。インポート機能実装時に参照。
---

# CSV インポート仕様

## 対応フォーマット

- エンコーディング: UTF-8（BOM付き対応）
- 区切り文字: カンマ（,）
- 引用符: ダブルクォート（"）
- 改行: LF または CRLF
- 最大行数: 10,000行

## 基本フロー

```
1. ファイルアップロード
   ↓
2. CSV パース & プレビュー表示（最初の5行）
   ↓
3. フィールドマッピングUI
   - CSV列 → ノートタイプのフィールド
   ↓
4. バリデーション
   ↓
5. インポート実行
   ↓
6. 結果表示（成功数、スキップ数、エラー詳細）
```

## マッピングUI

```
CSV列           →  ノートフィールド
─────────────────────────────────
[Column A ▼]    →  Front
[Column B ▼]    →  Back
[Column C ▼]    →  (使用しない)
[Column D ▼]    →  Extra
```

## 出典情報のインポート

source_info フィールドへのマッピングオプション:

| CSV列 | マッピング先 |
|-------|-------------|
| book | source_info.book |
| unit | source_info.unit |
| number | source_info.number |
| is_derivative | source_info.is_derivative |

## サンプルCSV

### Basic ノートタイプ用
```csv
front,back,book,unit,number
apple,りんご,ターゲット1900,1,1
banana,バナナ,ターゲット1900,1,2
"to go, went, gone",行く,ターゲット1900,1,3
```

### Cloze ノートタイプ用
```csv
text,extra
"I {{c1::have}} a pen.",持っている"
"She {{c1::goes}} to school.",三単現のs"
```

## バリデーションルール

1. **必須フィールド**: ノートタイプの必須フィールドがマッピングされていること
2. **空行**: スキップ
3. **重複チェック**: 同一デッキ内で同じfront/backの組み合わせ → 警告（スキップ or 上書き選択）
4. **文字数制限**: 1フィールド最大10,000文字

## エラーハンドリング

```typescript
interface ImportResult {
  imported: number;
  skipped: number;
  errors: Array<{
    row: number;
    column?: string;
    message: string;
  }>;
}
```

## パフォーマンス考慮

- 10,000行を超える場合は分割アップロードを推奨
- バッチ挿入（100件ずつ）
- プログレスバー表示

## 実装チェックリスト

- [ ] CSVパーサー（papaparse推奨）
- [ ] 文字コード検出/変換
- [ ] プレビューUI
- [ ] マッピングUI
- [ ] バリデーション
- [ ] 重複チェックオプション
- [ ] プログレス表示
- [ ] エラーレポート
- [ ] ロールバック対応
