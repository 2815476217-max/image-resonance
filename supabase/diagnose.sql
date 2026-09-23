-- 只读诊断：在 Supabase SQL Editor 运行，不会修改数据。
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname='uploads';

select policyname,cmd,roles,qual,with_check
from pg_policies where schemaname='public' and tablename='uploads'
order by policyname;

select id,name,public,file_size_limit,allowed_mime_types
from storage.buckets
where id in ('exhibition-images','exhibition-cutouts','exhibition-videos')
order by id;

select column_name,data_type,column_default,is_nullable
from information_schema.columns
where table_schema='public' and table_name='uploads'
order by ordinal_position;

select status,count(*) from public.uploads group by status order by status;
