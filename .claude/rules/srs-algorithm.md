# SRS アルゴリズムルール

## SM-2 アルゴリズム概要

### カード状態

```typescript
type CardState = 'new' | 'learning' | 'review' | 'relearning';

interface CardSchedule {
  due: Date;           // 次回復習日時
  interval: number;    // 現在の間隔（日）
  easeFactor: number;  // 難易度係数（デフォルト 2.5）
  repetitions: number; // 連続正解回数
  state: CardState;
  learningStep: number; // learning中のステップ
}
```

### 回答オプション

```typescript
enum Ease {
  Again = 1,  // 不正解、やり直し
  Hard = 2,   // 正解だが難しかった
  Good = 3,   // 正解
  Easy = 4,   // 簡単だった
}
```

### 学習ステップ（learning/relearning）

```typescript
const LEARNING_STEPS = [1, 10]; // 分
const RELEARNING_STEPS = [10]; // 分
```

### 間隔計算

```typescript
function calculateInterval(
  currentInterval: number,
  easeFactor: number,
  ease: Ease
): number {
  if (ease === Ease.Again) {
    return 1; // 1日に戻す
  }

  let modifier = 1;
  if (ease === Ease.Hard) modifier = 1.2;
  if (ease === Ease.Good) modifier = easeFactor;
  if (ease === Ease.Easy) modifier = easeFactor * 1.3;

  return Math.round(currentInterval * modifier);
}
```

### Ease Factor 更新

```typescript
function updateEaseFactor(
  currentEF: number,
  ease: Ease
): number {
  // SM-2 の公式
  const newEF = currentEF + (0.1 - (5 - ease) * (0.08 + (5 - ease) * 0.02));
  return Math.max(1.3, newEF); // 最小値 1.3
}
```

## 1日の区切り

- **午前4時** をリセット時刻とする
- due の比較は、現在時刻をリセット時刻で正規化してから行う

```typescript
function getStudyDayStart(date: Date, resetHour: number = 4): Date {
  const result = new Date(date);
  if (result.getHours() < resetHour) {
    result.setDate(result.getDate() - 1);
  }
  result.setHours(resetHour, 0, 0, 0);
  return result;
}
```

## 新規カード導入

- 1日あたりの新規カード上限: デッキ設定で指定（デフォルト 20）
- 今日すでに導入した新規カード数をカウントして制限

## カード取得順序

1. relearning カード（期限切れ）
2. learning カード（期限切れ）
3. review カード（期限切れ）
4. 新規カード（上限まで）
5. learning カード（学習中）

## テスト要件

- 各状態遷移のユニットテスト必須
- 境界値テスト（午前4時前後）
- Ease Factor の上下限テスト
