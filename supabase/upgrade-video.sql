-- 现有项目升级到：原图 + 透明 PNG + 黑底 WebM。可重复执行。
begin;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types) values
  ('exhibition-images','exhibition-images',true,10485760,array['image/jpeg','image/png','image/webp']),
  ('exhibition-cutouts','exhibition-cutouts',true,20971520,array['image/png']),
  ('exhibition-videos','exhibition-videos',true,52428800,array['video/webm'])
on conflict (id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

alter table public.uploads add column if not exists cutout_url text;
alter table public.uploads add column if not exists video_url text;
alter table public.uploads add column if not exists status text default 'processing';
alter table public.uploads alter column status set default 'processing';
alter table public.uploads add column if not exists type text not null default 'image';
create index if not exists uploads_playlist_idx on public.uploads (created_at asc,id asc) where status='ready' and video_url is not null;

alter table public.uploads drop constraint if exists uploads_status_check;
alter table public.uploads add constraint uploads_status_check check (status in ('ready','processing','failed','hidden'));
alter table public.uploads drop constraint if exists uploads_type_check;
alter table public.uploads add constraint uploads_type_check check (type in ('image','cutout','video'));
alter table public.uploads drop constraint if exists uploads_video_check;
alter table public.uploads add constraint uploads_video_check check (
  (cutout_url is null or length(cutout_url)<2048) and
  (video_url is null or length(video_url)<2048) and
  (type<>'video' or status<>'ready' or (cutout_url is not null and video_url is not null))
);

revoke all on public.uploads from anon,authenticated;
grant select on public.uploads to anon,authenticated;
grant insert (id,image_url,cutout_url,video_url,status,type) on public.uploads to anon,authenticated;
grant update (cutout_url,video_url,status) on public.uploads to anon,authenticated;
alter table public.uploads enable row level security;
drop policy if exists "exhibition insert ready" on public.uploads;
create policy "exhibition insert ready" on public.uploads for insert to anon,authenticated with check (
  status in ('processing','ready')
  and image_url ~ '^https://[^/]+/storage/v1/object/public/exhibition-images/[0-9a-f-]+\.(jpg|png|webp)$'
  and split_part(image_url,'/storage/v1/object/public/exhibition-images/',2) in (id::text||'.jpg',id::text||'.png',id::text||'.webp')
  and (status='processing' or (
    (type='image' and cutout_url is null and video_url is null)
    or (type='cutout' and cutout_url ~ '^https://[^/]+/storage/v1/object/public/exhibition-cutouts/[0-9a-f-]+\.png$' and video_url is null)
    or (type='video'
      and cutout_url ~ '^https://[^/]+/storage/v1/object/public/exhibition-cutouts/[0-9a-f-]+\.png$'
      and video_url ~ '^https://[^/]+/storage/v1/object/public/exhibition-videos/[0-9a-f-]+\.webm$'
      and split_part(cutout_url,'/storage/v1/object/public/exhibition-cutouts/',2)=id::text||'.png'
      and split_part(video_url,'/storage/v1/object/public/exhibition-videos/',2)=id::text||'.webm'
      and split_part(image_url,'/',3)=split_part(cutout_url,'/',3)
      and split_part(image_url,'/',3)=split_part(video_url,'/',3))
  ))
);
drop policy if exists "exhibition read ready" on public.uploads;
drop policy if exists "exhibition read gallery" on public.uploads;
-- 工作人员相册可检查 processing / failed；展示查询仍显式只读取 ready。
create policy "exhibition read gallery" on public.uploads for select to anon,authenticated using (status in ('processing','ready','failed'));
drop policy if exists "exhibition update processing" on public.uploads;
create policy "exhibition update processing" on public.uploads for update to anon,authenticated
using (status in ('processing','failed'))
with check (
  type='video' and status in ('processing','ready','failed')
  and image_url ~ '^https://[^/]+/storage/v1/object/public/exhibition-images/[0-9a-f-]+\.(jpg|png|webp)$'
  and split_part(image_url,'/storage/v1/object/public/exhibition-images/',2) in (id::text||'.jpg',id::text||'.png',id::text||'.webp')
  and (status<>'ready' or (
    cutout_url ~ '^https://[^/]+/storage/v1/object/public/exhibition-cutouts/[0-9a-f-]+\.png$'
    and video_url ~ '^https://[^/]+/storage/v1/object/public/exhibition-videos/[0-9a-f-]+\.webm$'
    and split_part(cutout_url,'/storage/v1/object/public/exhibition-cutouts/',2)=id::text||'.png'
    and split_part(video_url,'/storage/v1/object/public/exhibition-videos/',2)=id::text||'.webm'
  ))
);

drop policy if exists "exhibition upload images" on storage.objects;
create policy "exhibition upload images" on storage.objects for insert to anon,authenticated with check (
  bucket_id='exhibition-images' and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
);
drop policy if exists "exhibition upload cutouts" on storage.objects;
create policy "exhibition upload cutouts" on storage.objects for insert to anon,authenticated with check (
  bucket_id='exhibition-cutouts' and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$'
);
drop policy if exists "exhibition upload videos" on storage.objects;
create policy "exhibition upload videos" on storage.objects for insert to anon,authenticated with check (
  bucket_id='exhibition-videos' and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webm$'
);
commit;

-- UUID 文件名和 URL 约束限制匿名更新范围；生产展览如需更强隔离，可改用服务端签名任务。
