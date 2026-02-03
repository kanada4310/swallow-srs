-- Phase 4.2: 例文生成機能用のgenerated_content列を追加
-- 実行日: 2026-02-03

-- notes テーブルに generated_content カラムを追加
ALTER TABLE public.notes
ADD COLUMN IF NOT EXISTS generated_content JSONB DEFAULT NULL;

-- generated_content 用の GIN インデックスを追加（JSONB検索の最適化）
CREATE INDEX IF NOT EXISTS idx_notes_generated_content
ON public.notes USING gin (generated_content);

-- コメント追加
COMMENT ON COLUMN public.notes.generated_content IS 'AI生成コンテンツ: {examples: string[], collocations?: string[], generated_at: string, model: string}';
