create table if not exists public.voice_clones (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  voice_type text not null default 'custom',
  sample_url text not null,
  preview_audio_url text,
  avatar_image text,
  status text not null default 'queued',
  is_selected boolean not null default false,
  trigger_run_id text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.voice_tts_generations (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  voice_id text not null,
  voice_type text not null,
  voice_name text not null,
  text text not null,
  character_count integer not null,
  credits_charged integer not null,
  audio_url text,
  audio_mime_type text,
  status text not null default 'queued',
  trigger_run_id text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_credits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 2480,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_transactions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null,
  type text not null,
  description text not null,
  reference_id text,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_voice_clones_updated_at on public.voice_clones;
create trigger set_voice_clones_updated_at
before update on public.voice_clones
for each row execute function public.set_updated_at();

drop trigger if exists set_voice_tts_generations_updated_at on public.voice_tts_generations;
create trigger set_voice_tts_generations_updated_at
before update on public.voice_tts_generations
for each row execute function public.set_updated_at();

drop trigger if exists set_user_credits_updated_at on public.user_credits;
create trigger set_user_credits_updated_at
before update on public.user_credits
for each row execute function public.set_updated_at();

alter table public.voice_clones enable row level security;
alter table public.voice_tts_generations enable row level security;
alter table public.user_credits enable row level security;
alter table public.credit_transactions enable row level security;

grant select, insert, update on public.voice_clones to authenticated;
grant select, insert, update on public.voice_tts_generations to authenticated;
grant select, insert, update on public.user_credits to authenticated;
grant select, insert on public.credit_transactions to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'voice_clones' and policyname = 'Users manage own voice clones') then
    create policy "Users manage own voice clones" on public.voice_clones for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'voice_tts_generations' and policyname = 'Users manage own voice TTS') then
    create policy "Users manage own voice TTS" on public.voice_tts_generations for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_credits' and policyname = 'Users manage own credits') then
    create policy "Users manage own credits" on public.user_credits for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'credit_transactions' and policyname = 'Users manage own credit transactions') then
    create policy "Users manage own credit transactions" on public.credit_transactions for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;
