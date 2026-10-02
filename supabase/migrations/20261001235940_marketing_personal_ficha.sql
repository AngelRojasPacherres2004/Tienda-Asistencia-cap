ALTER TABLE public.personal_marketing ADD COLUMN IF NOT EXISTS perfil JSONB NOT NULL DEFAULT '{}'::jsonb;
