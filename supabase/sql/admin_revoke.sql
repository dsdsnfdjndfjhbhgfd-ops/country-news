-- Admin page: an admin removes another admin (nobody can remove themselves, so the site always keeps one).
-- Run once in Supabase → SQL Editor if the "Снять" button on admin.html says the function is missing.
create or replace function public.admin_revoke(target uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.need_admin();
  if target = auth.uid() then raise exception 'cannot_revoke_self' using errcode = '42501'; end if;
  delete from private.admins where user_id = target;
end $$;
revoke all on function public.admin_revoke(uuid) from public, anon;
grant execute on function public.admin_revoke(uuid) to authenticated;
