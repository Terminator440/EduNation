-- Hierarchical invitations: add secretariat role and optional email/phone + harden create_invitation authorization.

do $$
begin
  -- Add new invitation role value (idempotent)
  begin
    alter type public.invitation_role add value 'secretariat';
  exception
    when duplicate_object then null;
  end;
end $$;

alter table if exists public.invitations
  add column if not exists invited_email text,
  add column if not exists invited_phone text;

-- Replace create_invitation with authorization checks + email/phone support.
create or replace function public.create_invitation(
  p_role public.invitation_role,
  p_school_id uuid,
  p_class_id uuid default null,
  p_student_id uuid default null,
  p_invited_email text default null,
  p_invited_phone text default null,
  p_max_uses integer default 1,
  p_expires_hours integer default 24
)
returns table (
  invitation_id uuid,
  code text,
  expires_at timestamptz,
  max_uses integer,
  plain_code text,
  error_message text
)
language plpgsql
security definer
as $$
declare
  v_user_id uuid;
  v_code text;
  v_plain_code text;
  v_expires_at timestamptz;
  v_existing_count integer;
  v_class_school_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return query select null::uuid, null::text, null::timestamptz, null::integer, null::text, 'Not authenticated';
    return;
  end if;

  if p_max_uses < 1 then
    return query select null::uuid, null::text, null::timestamptz, null::integer, null::text, 'Max uses must be at least 1';
    return;
  end if;

  if p_expires_hours < 1 then
    return query select null::uuid, null::text, null::timestamptz, null::integer, null::text, 'Expires hours must be at least 1';
    return;
  end if;

  -- Role hierarchy enforcement:
  -- developer: anything
  -- director: teacher / homeroom_teacher / secretariat (for their school)
  -- homeroom_teacher: student / parent (for their class)
  if public.has_role(v_user_id, 'developer'::public.app_role) then
    -- ok
  elsif public.has_role(v_user_id, 'director'::public.app_role) then
    if p_role not in ('teacher','homeroom_teacher','secretariat') then
      return query select null::uuid, null::text, null::timestamptz, null::integer, null::text, 'Directors can only invite teacher / homeroom_teacher / secretariat';
      return;
    end if;

    if not exists (
      select 1 from public.profiles p
      where p.id = v_user_id and p.school_id = p_school_id
    ) then
      return query select null::uuid, null::text, null::timestamptz, null::integer, null::text, 'Director can only create invitations for their school';
      return;
    end if;

  elsif public.has_role(v_user_id, 'homeroom_teacher'::public.app_role) then
    if p_role not in ('student','parent') then
      return query select null::uuid, null::text, null::timestamptz, null::integer, null::text, 'Homeroom teachers can only invite student / parent';
      return;
    end if;

    if p_class_id is null then
      return query select null::uuid, null::text, null::timestamptz, null::integer, null::text, 'Class is required for student/parent invitations';
      return;
    end if;

    select c.school_id into v_class_school_id
    from public.classes c
    where c.id = p_class_id;

    if v_class_school_id is null or v_class_school_id <> p_school_id then
      return query select null::uuid, null::text, null::timestamptz, null::integer, null::text, 'Class does not belong to the specified school';
      return;
    end if;

    if not exists (
      select 1 from public.classes c
      where c.id = p_class_id and c.teacher_id = v_user_id
    ) then
      return query select null::uuid, null::text, null::timestamptz, null::integer, null::text, 'You are not the homeroom teacher for this class';
      return;
    end if;

  else
    return query select null::uuid, null::text, null::timestamptz, null::integer, null::text, 'Not authorized to create invitations';
    return;
  end if;

  -- Student/parent constraints
  if p_role in ('student', 'parent') and p_class_id is null then
    return query select null::uuid, null::text, null::timestamptz, null::integer, null::text, 'Class is required for student/parent invitations';
    return;
  end if;

  if p_role = 'parent'::public.invitation_role and p_student_id is null then
    return query select null::uuid, null::text, null::timestamptz, null::integer, null::text, 'Student is required for parent invitations';
    return;
  end if;

  if p_role in ('teacher', 'homeroom_teacher', 'secretariat') then
    p_class_id := null;
    p_student_id := null;
  end if;

  if p_invited_email is not null and length(trim(p_invited_email)) = 0 then
    p_invited_email := null;
  end if;

  if p_invited_phone is not null and length(trim(p_invited_phone)) = 0 then
    p_invited_phone := null;
  end if;

  v_expires_at := now() + (p_expires_hours || ' hours')::interval;

  -- generate unique code
  loop
    v_plain_code := substr(md5(random()::text), 1, 8);
    v_code := encode(digest(v_plain_code, 'sha256'), 'hex');

    select count(*) into v_existing_count
    from public.invitations
    where code_hash = v_code;

    exit when v_existing_count = 0;
  end loop;

  insert into public.invitations (
    role,
    school_id,
    class_id,
    student_id,
    invited_email,
    invited_phone,
    code_hash,
    max_uses,
    expires_at,
    created_by_user_id
  ) values (
    p_role,
    p_school_id,
    p_class_id,
    p_student_id,
    p_invited_email,
    p_invited_phone,
    v_code,
    p_max_uses,
    v_expires_at,
    v_user_id
  )
  returning id into invitation_id;

  return query select invitation_id, v_code, v_expires_at, p_max_uses, v_plain_code, null::text;

exception
  when others then
    return query select null::uuid, null::text, null::timestamptz, null::integer, null::text, sqlerrm;
end;
$$;

-- Update policy for directors to include secretariat invitations
drop policy if exists "Directors can view invitations for their school" on public.invitations;
create policy "Directors can view invitations for their school"
on public.invitations
for select
to authenticated
using (
  public.has_role(auth.uid(), 'director'::public.app_role)
  and school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
);

drop policy if exists "Directors can revoke invitations for their school" on public.invitations;
create policy "Directors can revoke invitations for their school"
on public.invitations
for update
to authenticated
using (
  public.has_role(auth.uid(), 'director'::public.app_role)
  and school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
)
with check (
  public.has_role(auth.uid(), 'director'::public.app_role)
  and school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
);
