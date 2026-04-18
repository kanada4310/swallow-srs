# billing 側 LINE通知 引き継ぎメモ（2026-04-18 更新）

**対象**: `kanada4310/swallow-billing` 側の LINE 復習通知ジョブ実装者
**前提ドキュメント**: `docs/billing-line-notification-spec.md`（全体設計・コード雛形）

このドキュメントは、SRS 側で最近入った変更と、それに対応して billing 側で
やっておきたい調整をまとめたものです。

---

## 1. SRS 側の最近の変更（2026-04-18）

### 1-1. `frontText` の生成ロジック刷新

従来は `field_values` から `Front / Text / Expression / Word` の優先順位で
**1フィールドだけ**抜き出していた。これだと「動詞の語法」のように、
その優先リストに合致しないフィールド名（`日本語文 / 指定動詞 / パーツ / 正答 / ID`）
を持つノートタイプでは、JS の挿入順で拾われた任意の1フィールド（多くの場合 `ID`
や `日本語文`）が通知に出てしまい、**学習画面で見える「表面」と一致しなかった**。

今回の変更:

- `card_templates.front_template` を `(note_type_id, ordinal=template_index)` で取得
- `renderTemplate` で Anki 互換レンダリング
  - `{{FieldName}}` 置換
  - `{{cloze:Text}}` 処理（表面はマスク、`[...]` または `[hint]` 表示）
  - `{{#Field}}...{{/Field}}` の条件分岐
  - `{{tts:Field}}` は値のみ残る（ボタンは剥ぐ）
- レンダ後の HTML を整形してプレーンテキスト化
  - `<br>` / `</p>` / `</div>` / `</li>` / `</h1-6>` → 改行
  - それ以外のタグは剥ぐ
  - `&nbsp; &amp; &lt; &gt; &quot; &#39;` をデコード
  - 連続空白・空行を圧縮
  - 100字超は末尾 `...`
- テンプレートが取得できない場合は旧 `extractFrontText` にフォールバック

**billing 側で特別な対応は不要**。API レスポンスのキーは変わらない
（`frontText` が従来より「カード表面に近い」値になるだけ）。ただし **改行を含む
可能性がある**ので、表示側の `wrap: true` と `maxLines` の扱いは再確認しておく。

### 1-2. 仕様書から補足キャプション削除

`docs/billing-line-notification-spec.md` の Flex 雛形から
「↑ こんなカードが待ってます」のテキストブロックを削除した。

billing 側で **既に `buildFlexMessage` を実装済み**の場合は、同じく対応する
2要素（`type: 'text'` で `text: '↑ こんなカードが待ってます'` の要素）を
削除してほしい。

---

## 2. billing 側でやること

### 2-1. `buildFlexMessage` の body からキャプション削除（実装済みの場合のみ）

```diff
  body: {
    type: 'box',
    layout: 'vertical',
    spacing: 'md',
    contents: [
      { type: 'text', text: student.deckName, size: 'sm', color: '#888888' },
      { type: 'text', text: previewText, size: 'xl', weight: 'bold', wrap: true },
-     { type: 'text', text: '↑ こんなカードが待ってます', size: 'xxs', color: '#aaaaaa', margin: 'sm' },
    ],
  },
```

### 2-2. `previewText` の改行対応

`frontText` に `\n` が含まれるケースが増えた（Basic の `{{Front}}<br>{{Hint}}`
のようなテンプレートなど）。現行の雛形は `slice(0, 57)` で文字数カットしている
だけなので、改行はそのまま Flex の `text` フィールドに渡せば OK
（`wrap: true` が付いていれば LINE 側で表示される）。

ただし表示行数が増えすぎるとバブルの縦長が気になる場合は、billing 側で
適宜制限してもいい:

```typescript
// 例: 最大3行に制限
const previewText = (() => {
  const lines = student.frontText.split('\n').slice(0, 3)
  const joined = lines.join('\n')
  return joined.length > 80 ? joined.slice(0, 77) + '…' : joined
})()
```

### 2-3. 未実装分（仕様書 §3-§6 参照）

まだ実装していないなら、以下の順で進めると動作確認が早い:

1. 環境変数セット（`SRS_BASE_URL`, `SRS_AUTH_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, `LIFF_NOTIFICATION_URL`）
2. `src/services/line-notification.service.ts`（`fetchDueSummary` / `buildFlexMessage` / `pushFlexToUser` / `runDailyLineReminder`）
3. `POST /api/admin/notify-line`（手動トリガー）でテスト送信 → 自分の LINE に届くか確認
4. LIFF ページ + `POST /api/auth/issue-srs-token`（既存の LIFF 自動ログイン実装があれば再利用）
5. `vercel.json` に Cron 追加（`0 22 * * *` = JST 07:00）
6. 本番デプロイ + Vercel Logs で翌朝の挙動確認

---

## 3. SRS 側 API の現状（再掲）

### `GET /api/admin/due-cards-summary`

**認証**: `Authorization: Bearer ${SRS_AUTH_SECRET}`（既存の billing-sync と共有）

**レスポンス**:
```json
{
  "students": [
    {
      "lineUserId": "U1234...",
      "name": "田中太郎",
      "dueCount": 42,
      "frontText": "彼は私に本をくれた。\n(give)",
      "deckName": "動詞の語法 / SVOO",
      "deckId": "8e1c4a2f-...",
      "cardId": "a3f2b1d0-..."
    }
  ]
}
```

**挙動メモ**:
- `dueCount` は実枚数（`count: 'exact'`）。0枚の生徒は配列に入らない
- `frontText` は**カードテンプレートをレンダリングした表面**のプレーンテキスト（改行を含むことあり、最大100字）
- `deckId` は直近の `review_logs` に残っているデッキ（フィルタサブデッキで学習中なら子デッキ）を優先
- `cardId` はその代表カード ID。`/study?deck=xxx&card=yyy` で開くと学習開始時に最初に表示される

### `GET /auth/line?token=<JWT>&next=<path>`

- `next` は相対パスのみ許可（`//evil.com` や `javascript:` は `/` にフォールバック）
- LIFF から `?next=%2Fstudy%3Fdeck%3D...%26card%3D...` を渡すと、該当カードから学習開始

---

## 4. 参考: SRS 側の関連ファイル

| 用途 | パス |
|---|---|
| 通知データ API | `src/app/api/admin/due-cards-summary/route.ts` |
| テンプレートレンダラー | `src/lib/template/renderer.ts` |
| frontText 生成 | `src/lib/push/extract-text.ts`（`renderCardFrontText`） |
| LINE 自動ログイン | `src/app/(auth)/auth/line/route.ts` |
| `next` 検証 | `src/lib/auth/safe-next.ts` |

---

## 5. 動作確認のチェックリスト

- [ ] `curl -H "Authorization: Bearer $SRS_AUTH_SECRET" $SRS_BASE_URL/api/admin/due-cards-summary` が 200 を返す
- [ ] `frontText` が実際の学習画面の表面と一致している（改行も含めて）
- [ ] Cloze カードで答え部分が `[...]` や `[hint]` にマスクされている
- [ ] Flex メッセージからキャプション行が消えている
- [ ] 「今すぐ学習を始める」→ LIFF → SRS の該当デッキ/カードで学習画面が開く
- [ ] Vercel Cron が朝 07:00 JST に発火している（Logs で確認）
