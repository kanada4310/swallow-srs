# billing側 LINE 通知ジョブ 実装スペック

SRS の `due-cards-summary` API を叩いて、期限切れカードがある生徒に LINE Flex メッセージで復習通知を送るジョブを **billing 側に** 実装する。

> **対象リポジトリ**: `kanada4310/swallow-billing`
> **SRS 側の準備**: 完了済み（このドキュメントが書かれた時点で `due-cards-summary` API + `/auth/line?next=` 対応済）

---

## 1. 全体フロー

```
┌─────────────┐  ① cron 22:00 UTC      ┌──────────────────────┐
│  billing    │ ────────────────────▶ │ SRS                  │
│  Vercel     │   GET due-cards-      │  /api/admin/         │
│  Cron       │   summary (Bearer)    │  due-cards-summary   │
└─────────────┘ ◀──────────────────── └──────────────────────┘
                ② students[]
                                     ┌─────────────────────┐
                ③ Flex 生成           │  billing            │
                                     │   build flex        │
                                     └─────────────────────┘
                ④ pushMessage        ┌─────────────────────┐
                ────────────────────▶│  LINE Messaging API │
                                     └─────────────────────┘
                                                │
                                                ▼ ⑤ Bot 経由で生徒に届く
                                     ┌─────────────────────┐
                                     │  生徒の LINE        │
                                     │  「学習を始める」   │
                                     └─────────────────────┘
                                                │ ⑥ LIFF
                                                ▼
                                     ┌─────────────────────┐
                                     │  billing LIFF page  │
                                     │  → JWT 発行         │
                                     │  → SRS にリダイレクト│
                                     └─────────────────────┘
                                                │
                                                ▼
                                     ┌──────────────────────────┐
                                     │ SRS /auth/line           │
                                     │  ?token=...&next=/study  │
                                     │   ?deckId=xxx            │
                                     └──────────────────────────┘
                                                │
                                                ▼
                                     学習画面（該当デッキ）が直接開く
```

---

## 2. SRS 側 API（呼び出すだけ）

### 2-1. `GET /api/admin/due-cards-summary`

**認証**: `Authorization: Bearer ${SRS_AUTH_SECRET}`（billing 既存の同期と共有の値）

**レスポンス**:
```json
{
  "students": [
    {
      "lineUserId": "U1234abcd...",
      "name": "田中太郎",
      "dueCount": 42,
      "frontText": "apple",
      "deckName": "英単語ターゲット1900",
      "deckId": "8e1c...",
      "cardId": "a3f2..."
    }
  ]
}
```

**注意点**:
- `dueCount` は実際の枚数（上限なし）
- `frontText` はランダムに選ばれた1枚の表面テキスト（プレーンテキスト化済み）
- `deckId` はその代表カードが属するデッキ ID（最後に学習したフィルタサブデッキがあればそちら）。`/study?deck=xxx` で深いリンク可
- `cardId` は `frontText` に対応するカード ID。`/study?deck=xxx&card=yyy` で学習開始時にそのカードを最初に表示
- `students` は期限切れカードがあるユーザーのみ返る（0枚は除外）

### 2-2. `GET /auth/line?token=<JWT>&next=<path>`

**用途**: LIFF からの自動ログイン + 任意の SRS 内パスへの深いリンク。

- `token`: billing 発行 JWT（既存）
- `next`: SRS 内の相対パスのみ許可（`//evil.com` などは弾かれて `/` にフォールバック）

例: `https://srs.example.com/auth/line?token=eyJh...&next=%2Fstudy%3FdeckId%3D8e1c...`

---

## 3. billing 側の実装内容

### 3-1. 環境変数

`.env.local` / Vercel 環境変数に追加:

```
SRS_BASE_URL=https://srs.example.com
SRS_AUTH_SECRET=既存の同期で使っている値
LINE_CHANNEL_ACCESS_TOKEN=（LINE Bot の長期トークン）
LIFF_NOTIFICATION_URL=https://liff.line.me/<LIFF_ID_FOR_NOTIFICATION>
```

### 3-2. ファイル構成（参考）

```
src/
  services/
    line-notification.service.ts   # 本体ロジック
  app/api/
    admin/notify-line/route.ts     # 手動トリガー（テスト用）
    cron/line-reminder/route.ts    # Vercel Cron 用
vercel.json                         # Cron 設定
```

### 3-3. サービスコード（雛形）

```typescript
// src/services/line-notification.service.ts

interface DueCardStudent {
  lineUserId: string
  name: string
  dueCount: number
  frontText: string
  deckName: string
  deckId: string | null
  cardId: string | null
}

interface SummaryResponse {
  students: DueCardStudent[]
}

const SRS_BASE_URL = process.env.SRS_BASE_URL!
const SRS_AUTH_SECRET = process.env.SRS_AUTH_SECRET!
const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN!
const LIFF_URL = process.env.LIFF_NOTIFICATION_URL!

export async function fetchDueSummary(): Promise<DueCardStudent[]> {
  const res = await fetch(`${SRS_BASE_URL}/api/admin/due-cards-summary`, {
    headers: { Authorization: `Bearer ${SRS_AUTH_SECRET}` },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`due-cards-summary failed: ${res.status} ${await res.text()}`)
  }
  const data = (await res.json()) as SummaryResponse
  return data.students
}

export function buildFlexMessage(student: DueCardStudent) {
  // LIFF URL に state を仕込み、LIFF 側で SRS の /auth/line?next=... を組む
  let studyPath = '/study'
  if (student.deckId) {
    studyPath = `/study?deck=${student.deckId}`
    if (student.cardId) {
      studyPath += `&card=${student.cardId}`
    }
  }
  const startUrl = `${LIFF_URL}?next=${encodeURIComponent(studyPath)}`

  // 安全な表示用に長文/改行を抑制
  const previewText = student.frontText.length > 60
    ? student.frontText.slice(0, 57) + '…'
    : student.frontText

  return {
    type: 'flex' as const,
    altText: `${student.name}さん、復習カードが${student.dueCount}枚あります`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: 'つばめSRS',
            color: '#ffffff',
            size: 'sm',
            weight: 'bold',
          },
          {
            type: 'text',
            text: `復習カードが ${student.dueCount} 枚あります`,
            color: '#ffffff',
            size: 'lg',
            weight: 'bold',
            wrap: true,
          },
        ],
        backgroundColor: '#1f6feb',
        paddingAll: '16px',
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          {
            type: 'text',
            text: student.deckName || 'デッキ',
            size: 'sm',
            color: '#888888',
          },
          {
            type: 'text',
            text: previewText,
            size: 'xl',
            weight: 'bold',
            wrap: true,
          },
          {
            type: 'text',
            text: '↑ こんなカードが待ってます',
            size: 'xxs',
            color: '#aaaaaa',
            margin: 'sm',
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#1f6feb',
            action: {
              type: 'uri',
              label: '今すぐ学習を始める',
              uri: startUrl,
            },
          },
        ],
      },
    },
  }
}

export async function pushFlexToUser(student: DueCardStudent) {
  const flex = buildFlexMessage(student)
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${LINE_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: student.lineUserId,
      messages: [flex],
    }),
  })

  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    return { ok: false, status: res.status, error: errBody }
  }
  return { ok: true, status: res.status }
}

export async function runDailyLineReminder() {
  const students = await fetchDueSummary()
  const results = await Promise.allSettled(students.map(pushFlexToUser))

  const summary = {
    targeted: students.length,
    sent: 0,
    failed: 0,
    errors: [] as Array<{ lineUserId: string; reason: unknown }>,
  }

  results.forEach((r, i) => {
    const s = students[i]
    if (r.status === 'fulfilled' && r.value.ok) summary.sent++
    else {
      summary.failed++
      summary.errors.push({
        lineUserId: s.lineUserId,
        reason: r.status === 'fulfilled' ? r.value : r.reason,
      })
    }
  })

  return summary
}
```

### 3-4. Cron エンドポイント

```typescript
// src/app/api/cron/line-reminder/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { runDailyLineReminder } from '@/services/line-notification.service'

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const summary = await runDailyLineReminder()
    console.log('[line-reminder] Summary:', JSON.stringify(summary))
    return NextResponse.json({ ok: true, summary })
  } catch (err) {
    console.error('[line-reminder] Failed:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
```

### 3-5. `vercel.json` Cron 設定

```json
{
  "crons": [
    {
      "path": "/api/cron/line-reminder",
      "schedule": "0 22 * * *"
    }
  ]
}
```

> 22:00 UTC = 07:00 JST。Vercel Cron は UTC で指定する。

### 3-6. 手動トリガー（テスト用）

```typescript
// src/app/api/admin/notify-line/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { runDailyLineReminder } from '@/services/line-notification.service'

export async function POST(request: NextRequest) {
  // billing 側 admin 認証（既存パターンに合わせる）
  const summary = await runDailyLineReminder()
  return NextResponse.json({ summary })
}
```

billing 側ダッシュボードに「LINE通知をテスト送信」ボタンを置いて呼び出すと、開発時に確認しやすい。

---

## 4. LIFF 側ハンドリング

### 4-1. なぜ LIFF を経由するか

「学習を始める」ボタンから直接 `https://srs.example.com/auth/line?token=...` にしたいが、その時点ではユーザーの LINE userId しかわからず JWT は作れない（billing サーバ側で署名する必要がある）。

そこで:
1. ボタンの `uri` を **LIFF URL** にする
2. LIFF が起動すると LINE SDK で `getProfile()` できる
3. LIFF が `?next=...` を読み、billing API `POST /api/auth/issue-srs-token` に LINE access token + next を送って JWT を取得
4. LIFF が `https://srs.example.com/auth/line?token=<JWT>&next=<next>` にリダイレクト

### 4-2. LIFF ページ（雛形）

```typescript
// src/app/liff/notification/page.tsx
'use client'
import { useEffect } from 'react'
import liff from '@line/liff'

export default function NotificationLiffPage() {
  useEffect(() => {
    (async () => {
      await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID! })
      if (!liff.isLoggedIn()) {
        liff.login()
        return
      }

      const params = new URLSearchParams(window.location.search)
      const next = params.get('next') || '/'

      // billing API 経由で SRS 用 JWT を取得
      const tokenRes = await fetch('/api/auth/issue-srs-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: liff.getAccessToken(),
        }),
      })
      const { token } = await tokenRes.json()

      const url = `${process.env.NEXT_PUBLIC_SRS_BASE_URL}/auth/line`
        + `?token=${encodeURIComponent(token)}`
        + `&next=${encodeURIComponent(next)}`
      window.location.replace(url)
    })()
  }, [])

  return <div>ログイン中...</div>
}
```

### 4-3. SRS 用 JWT 発行 API

```typescript
// src/app/api/auth/issue-srs-token/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { SignJWT } from 'jose'

export async function POST(request: NextRequest) {
  const { accessToken } = await request.json()

  // LINE access token を verify して line userId と name を得る
  const profileRes = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!profileRes.ok) {
    return NextResponse.json({ error: 'Invalid LINE token' }, { status: 401 })
  }
  const { userId, displayName } = await profileRes.json()

  // billing 側 DB を引いて role を確定（生徒 / 講師）
  const role = 'student' // TODO: 実装

  const secret = new TextEncoder().encode(process.env.SRS_AUTH_SECRET!)
  const token = await new SignJWT({ name: displayName, role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setExpirationTime('5m')
    .sign(secret)

  return NextResponse.json({ token })
}
```

> **既存実装との重複に注意**: billing 側にすでに同等の JWT 発行処理がある場合（既存の LIFF 自動ログインで使っている）、それを再利用する。新規作成は不要。

---

## 5. 運用・注意事項

### 5-1. レート制限
- LINE Messaging API: プランによる（Developer Trial: 1,000 件/月、Free: 200 件/月、Light: 15,000 件/月）
- 50 名規模なら問題ないが、テスト送信を繰り返すと溶ける
- 失敗時のリトライは1回だけにする

### 5-2. 重複送信防止
- 1日1回の cron で十分。手動テスト時は `notify-line` API でログを残す
- 必要なら billing 側 DB に `notification_logs` テーブルを切って `(user_id, sent_date)` でユニーク制約

### 5-3. オプトアウト
- LINE 側で「ブロック」されていれば pushMessage は失敗するだけで害はない（403 / 410 が返る）
- billing 側でユーザー設定として「通知 ON/OFF」を持たせる場合は、`fetchDueSummary` 後にフィルタする

### 5-4. 0枚の生徒
- SRS 側で除外済み（`students` 配列に入らない）

### 5-5. デッキ未指定
- SRS 側で `deckId` が `null` で返るケースは現状ないが、将来カードがすべて削除されたユーザー等で起こり得る
- その場合は `/study`（デッキ未指定）にフォールバック → トップで生徒が選ぶ

### 5-6. JST と UTC
- Cron は UTC 指定（`0 22 * * *` = JST 07:00）
- 「今日の」期限切れの定義は SRS 側で `due <= now()` を見ているだけなので、タイムゾーン問題は発生しない

---

## 6. テスト手順

1. billing 側の `LINE_CHANNEL_ACCESS_TOKEN` と `LIFF_NOTIFICATION_URL` をローカル `.env` にセット
2. `npm run dev` → `POST /api/admin/notify-line` を Postman 等で叩く
3. テスト用 LINE アカウントに Flex が届くことを確認
4. 「今すぐ学習を始める」をタップ → LIFF が起動 → SRS の該当デッキ学習画面に遷移
5. 完了したら Vercel に環境変数登録 + デプロイ
6. Vercel Cron が朝 07:00 JST に動くことを Logs で確認

---

## 7. SRS 側の関連ファイル（参考）

| 用途 | パス |
|---|---|
| 通知データ取得 API | `src/app/api/admin/due-cards-summary/route.ts` |
| LINE 自動ログイン | `src/app/(auth)/auth/line/route.ts` |
| LINE ユーザー処理 | `src/lib/auth/line-user.ts` |
| `next` 検証ヘルパー | `src/lib/auth/safe-next.ts` |
| 表面テキスト抽出 | `src/lib/push/extract-text.ts` |
