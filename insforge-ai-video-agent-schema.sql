create table if not exists public.ai_video_projects (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  script text not null,
  script_mode text not null default 'manual',
  script_topic text,
  duration_seconds integer not null,
  screen_size text not null,
  avatar_id text not null,
  avatar_name text not null,
  avatar_style text,
  avatar_image_url text,
  voice_id text not null,
  voice_type text not null,
  voice_name text not null,
  caption_style text not null,
  broll_style text not null,
  credits_charged integer not null default 0,
  status text not null default 'queued',
  progress integer not null default 0,
  progress_stage text,
  trigger_run_id text,
  voiceover_url text,
  captions jsonb,
  composition_data jsonb,
  preview_url text,
  final_video_url text,
  final_video_mime_type text,
  thumbnail_url text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_video_scenes (
  id uuid primary key,
  project_id uuid not null references public.ai_video_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  scene_index integer not null,
  title text not null,
  summary text not null,
  start_time numeric not null,
  end_time numeric not null,
  voiceover_segment text not null,
  caption_text text not null,
  broll_requirement text not null,
  visual_prompt text,
  stock_keyword text,
  remotion_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_video_assets (
  id uuid primary key,
  project_id uuid not null references public.ai_video_projects(id) on delete cascade,
  scene_id uuid references public.ai_video_scenes(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_type text not null,
  url text,
  mime_type text,
  provider text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_video_projects_user_created_idx
on public.ai_video_projects (user_id, created_at desc);

create index if not exists ai_video_scenes_project_idx
on public.ai_video_scenes (project_id, scene_index);

create index if not exists ai_video_assets_project_idx
on public.ai_video_assets (project_id, asset_type);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_ai_video_projects_updated_at on public.ai_video_projects;
create trigger set_ai_video_projects_updated_at
before update on public.ai_video_projects
for each row execute function public.set_updated_at();

drop trigger if exists set_ai_video_scenes_updated_at on public.ai_video_scenes;
create trigger set_ai_video_scenes_updated_at
before update on public.ai_video_scenes
for each row execute function public.set_updated_at();

drop trigger if exists set_ai_video_assets_updated_at on public.ai_video_assets;
create trigger set_ai_video_assets_updated_at
before update on public.ai_video_assets
for each row execute function public.set_updated_at();

alter table public.ai_video_projects enable row level security;
alter table public.ai_video_scenes enable row level security;
alter table public.ai_video_assets enable row level security;

grant select, insert, update on public.ai_video_projects to authenticated;
grant select, insert, update on public.ai_video_scenes to authenticated;
grant select, insert, update on public.ai_video_assets to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ai_video_projects' and policyname = 'Users manage own AI video projects') then
    create policy "Users manage own AI video projects" on public.ai_video_projects for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ai_video_scenes' and policyname = 'Users manage own AI video scenes') then
    create policy "Users manage own AI video scenes" on public.ai_video_scenes for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ai_video_assets' and policyname = 'Users manage own AI video assets') then
    create policy "Users manage own AI video assets" on public.ai_video_assets for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;
