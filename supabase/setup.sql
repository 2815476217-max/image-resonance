-- 在 Supabase SQL Editor 中运行。可重复执行。
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exhibition-images', 'exhibition-images', true, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.uploads (
  id uuid primary key,
  image_url text not null check (length(image_url) < 2048),
  created_at timestamptz not null default now(),
  status text not null default 'ready' check (status in ('ready', 'hidden'))
);
create index if not exists uploads_latest_idx on public.uploads (created_at desc, id desc) where status = 'ready';
alter table public.uploads enable row level security;
revoke all on public.uploads from anon, authenticated;
grant select on public.uploads to anon, authenticated;
grant insert (id, image_url, status) on public.uploads to anon, authenticated;

drop policy if exists "exhibition read ready" on public.uploads;
create policy "exhibition read ready" on public.uploads for select to anon, authenticated using (status = 'ready');
drop policy if exists "exhibition insert ready" on public.uploads;
create policy "exhibition insert ready" on public.uploads for insert to anon, authenticated with check (
  status = 'ready'
  and image_url ~ '^https://[^/]+/storage/v1/object/public/exhibition-images/[0-9a-f-]+\.(jpg|png|webp)$'
  and split_part(image_url, '/storage/v1/object/public/exhibition-images/', 2) in (id::text || '.jpg', id::text || '.png', id::text || '.webp')
);

drop policy if exists "exhibition upload images" on storage.objects;
create policy "exhibition upload images" on storage.objects for insert to anon, authenticated with check (
  bucket_id = 'exhibition-images'
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
);
-- 不开放更新或删除；公众只能上传新文件、读取 ready 记录。

-- VIDEO UPGRADE
-- 已安装第一版的项目只需运行本文件。保留已有照片和记录。
begin;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exhibition-videos', 'exhibition-videos', true, 52428800, array['video/webm'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

alter table public.uploads add column if not exists video_url text;
alter table public.uploads add column if not exists type text not null default 'image';
alter table public.uploads drop constraint if exists uploads_status_check;
alter table public.uploads add constraint uploads_status_check check (status in ('ready','processing','failed','hidden'));
alter table public.uploads drop constraint if exists uploads_type_check;
alter table public.uploads add constraint uploads_type_check check (type in ('image','video'));
alter table public.uploads drop constraint if exists uploads_video_check;
alter table public.uploads add constraint uploads_video_check check (
  (video_url is null or length(video_url) < 2048)
  and (type <> 'video' or status <> 'ready' or video_url is not null)
);

revoke all on public.uploads from anon, authenticated;
grant select on public.uploads to anon, authenticated;
grant insert (id, image_url, video_url, status, type) on public.uploads to anon, authenticated;
alter table public.uploads enable row level security;
drop policy if exists "exhibition insert ready" on public.uploads;
create policy "exhibition insert ready" on public.uploads for insert to anon, authenticated with check (
  status = 'ready'
  and image_url ~ '^https://[^/]+/storage/v1/object/public/exhibition-images/[0-9a-f-]+\.(jpg|png|webp)$'
  and split_part(image_url, '/storage/v1/object/public/exhibition-images/', 2) in (id::text || '.jpg', id::text || '.png', id::text || '.webp')
  and (
    (type = 'image' and video_url is null)
    or (type = 'video'
      and video_url ~ '^https://[^/]+/storage/v1/object/public/exhibition-videos/[0-9a-f-]+\.webm$'
      and split_part(video_url, '/storage/v1/object/public/exhibition-videos/', 2) = id::text || '.webm'
      and split_part(video_url, '/', 3) = split_part(image_url, '/', 3))
  )
);
drop policy if exists "exhibition read ready" on public.uploads;
create policy "exhibition read ready" on public.uploads for select to anon, authenticated using (status = 'ready');
drop policy if exists "exhibition upload videos" on storage.objects;
create policy "exhibition upload videos" on storage.objects for insert to anon, authenticated with check (
  bucket_id = 'exhibition-videos'
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webm$'
);
commit;
-- 此版仅最后一次插入 ready。processing / failed 为后续后台任务预留，
-- 不为匿名用户开放 UPDATE/DELETE，也不在半成品阶段写入数据库。


-- CUTOUT UPGRADE
-- 已有任意图片/视频版项目运行本文件。保留旧记录、文件及视频字段。
begin;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('exhibition-cutouts','exhibition-cutouts',true,20971520,array['image/png'])
on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
alter table public.uploads add column if not exists cutout_url text;
alter table public.uploads add column if not exists video_url text;
alter table public.uploads add column if not exists type text not null default 'image';
alter table public.uploads drop constraint if exists uploads_type_check;
alter table public.uploads add constraint uploads_type_check check(type in ('image','video','cutout'));
alter table public.uploads drop constraint if exists uploads_cutout_check;
alter table public.uploads add constraint uploads_cutout_check check(
  (cutout_url is null or length(cutout_url)<2048)
  and (type<>'cutout' or status<>'ready' or cutout_url is not null)
);
alter table public.uploads enable row level security;
revoke all on public.uploads from anon,authenticated;
grant select on public.uploads to anon,authenticated;
grant insert(id,image_url,cutout_url,video_url,status,type) on public.uploads to anon,authenticated;
drop policy if exists "exhibition read ready" on public.uploads;
create policy "exhibition read ready" on public.uploads for select to anon,authenticated using(status='ready');
drop policy if exists "exhibition insert ready" on public.uploads;
create policy "exhibition insert ready" on public.uploads for insert to anon,authenticated with check(
  status='ready'
  and image_url ~ '^https://[^/]+/storage/v1/object/public/exhibition-images/[0-9a-f-]+\.(jpg|png|webp)$'
  and split_part(image_url,'/storage/v1/object/public/exhibition-images/',2) in (id::text||'.jpg',id::text||'.png',id::text||'.webp')
  and (
    (type='cutout' and video_url is null
      and cutout_url ~ '^https://[^/]+/storage/v1/object/public/exhibition-cutouts/[0-9a-f-]+\.png$'
      and split_part(cutout_url,'/storage/v1/object/public/exhibition-cutouts/',2)=id::text||'.png'
      and split_part(cutout_url,'/',3)=split_part(image_url,'/',3))
    or (type='image' and cutout_url is null and video_url is null)
    or (type='video' and cutout_url is null
      and video_url ~ '^https://[^/]+/storage/v1/object/public/exhibition-videos/[0-9a-f-]+\.webm$'
      and split_part(video_url,'/storage/v1/object/public/exhibition-videos/',2)=id::text||'.webm'
      and split_part(video_url,'/',3)=split_part(image_url,'/',3))
  )
);
drop policy if exists "exhibition upload cutouts" on storage.objects;
create policy "exhibition upload cutouts" on storage.objects for insert to anon,authenticated with check(
  bucket_id='exhibition-cutouts'
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$'
);
commit;
-- 仅最后插入 ready，不开放匿名 UPDATE/DELETE，失败可在页面内重试。

