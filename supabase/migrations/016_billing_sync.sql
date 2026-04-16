-- 016_billing_sync.sql
-- billing-SRS ミラーリング同期のためのスキーマ変更

-- classesテーブルにbilling連携カラム追加
ALTER TABLE classes ADD COLUMN IF NOT EXISTS billing_template_id TEXT UNIQUE;

-- teacher_idをnullable化（billing同期で講師なしクラスを作成可能に）
ALTER TABLE classes ALTER COLUMN teacher_id DROP NOT NULL;
