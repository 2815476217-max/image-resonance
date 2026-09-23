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
