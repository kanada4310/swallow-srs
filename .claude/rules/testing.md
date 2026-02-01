# テストルール

## フレームワーク

- **Vitest**: ユニット・統合テスト
- **Testing Library**: コンポーネントテスト
- **Playwright**: E2Eテスト（将来）

## ディレクトリ構成

```
src/
  lib/
    srs/
      scheduler.ts
      scheduler.test.ts  # コロケーション
  components/
    card/
      Card.tsx
      Card.test.tsx
tests/
  e2e/                   # E2Eテスト（将来）
```

## テスト優先度

### 必須（高優先度）
- SRSアルゴリズム（scheduler.ts）
- テンプレートサニタイザー
- 同期ロジック

### 推奨（中優先度）
- APIハンドラー
- フォームバリデーション

### オプション（低優先度）
- UIコンポーネント単体

## テストの書き方

```typescript
import { describe, it, expect } from 'vitest'
import { calculateNextReview } from './scheduler'

describe('SRS Scheduler', () => {
  describe('calculateNextReview', () => {
    it('should return 1 day interval for Again response', () => {
      const result = calculateNextReview({
        interval: 10,
        easeFactor: 2.5,
        ease: 1, // Again
      })
      expect(result.interval).toBe(1)
    })

    it('should increase ease factor for Easy response', () => {
      const result = calculateNextReview({
        interval: 10,
        easeFactor: 2.5,
        ease: 4, // Easy
      })
      expect(result.easeFactor).toBeGreaterThan(2.5)
    })
  })
})
```

## モック

### Supabase モック
```typescript
import { vi } from 'vitest'

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: vi.fn(() => ({
      select: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
  }),
}))
```

### 時間のモック（SRSテスト用）
```typescript
import { vi, beforeEach, afterEach } from 'vitest'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2024-01-15T10:00:00'))
})

afterEach(() => {
  vi.useRealTimers()
})
```

## 実行コマンド

```bash
npm run test              # 全テスト実行
npm run test:watch        # 監視モード
npm run test -- scheduler # 特定ファイル
npm run test:coverage     # カバレッジ
```
