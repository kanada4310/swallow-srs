# Frontend ルール

## Next.js App Router

- `use client` は必要な場合のみ（インタラクティブなコンポーネント）
- Server Components をデフォルトで使用
- データフェッチは Server Components で行う

## コンポーネント設計

- コンポーネントは `src/components/` に配置
- ページ固有のコンポーネントは `src/app/[route]/_components/` に配置
- Props は interface で定義

```tsx
interface CardProps {
  card: Card;
  onAnswer: (ease: number) => void;
}

export function Card({ card, onAnswer }: CardProps) {
  // ...
}
```

## スタイリング

- Tailwind CSS を使用
- カスタムCSSは極力避ける
- レスポンシブ: モバイルファーストで設計

```tsx
// モバイルファースト
<div className="p-4 md:p-8 lg:p-12">
```

## 状態管理

- ローカル状態: useState / useReducer
- サーバー状態: Supabase Realtime または SWR/TanStack Query
- グローバル状態: Context API（必要最小限）

## フォーム

- React Hook Form を使用
- Zod でバリデーション

## アクセシビリティ

- セマンティックHTML
- キーボードナビゲーション対応
- aria属性適切に設定
