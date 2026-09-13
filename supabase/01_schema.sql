-- AYNI · ejecutar una vez en SQL Editor de un proyecto Supabase NUEVO.
begin;
create type public.app_role as enum ('cliente','comercio','administrador','entidad_financiera');
create type public.account_status as enum ('activo','inactivo','eliminado');
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null check (char_length(full_name) between 3 and 100),
 email text not null,
 phone text not null default '' check(char_length(phone)<=20),
 role public.app_role not null default 'cliente',
 status public.account_status not null default 'activo',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 deleted_at timestamptz
);
create index profiles_role_status on public.profiles(role,status);
create table public.user_audit (
 id bigint generated always as identity primary key,
 actor_id uuid,
 target_id uuid not null,
 action text not null,
 details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
alter table public.user_audit enable row level security;
-- SECURITY DEFINER evita recursión RLS; sin parámetros que permitan suplantar actor.
create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.profiles where id=(select auth.uid()) and role='administrador' and status='activo');
$$;
create function public.is_active() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.profiles where id=(select auth.uid()) and status='activo');
$$;
revoke all on function public.is_admin() from public,anon;
revoke all on function public.is_active() from public,anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_active() to authenticated;
create policy profiles_read on public.profiles for select to authenticated using(id=(select auth.uid()) or (select public.is_admin()));
create policy profile_self_edit on public.profiles for update to authenticated using(id=(select auth.uid()) and (select public.is_active())) with check(id=(select auth.uid()) and (select public.is_active()));
create policy audit_admin_read on public.user_audit for select to authenticated using((select public.is_admin()));
-- RLS protege filas; privilegios de columna impiden ascender rol por REST.
revoke all on public.profiles from anon,authenticated;
grant select on public.profiles to authenticated;
grant update(full_name,phone) on public.profiles to authenticated;
revoke all on public.user_audit from anon,authenticated;
grant select on public.user_audit to authenticated;
create function public.on_auth_user_created() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id,email,full_name,phone,role,status)
 values(new.id,new.email,left(case when char_length(trim(coalesce(new.raw_user_meta_data->>'full_name',''))) >= 3 then trim(new.raw_user_meta_data->>'full_name') else 'Nuevo usuario' end,100),left(coalesce(new.raw_user_meta_data->>'phone',''),20),'cliente','activo');
 insert into public.user_audit(actor_id,target_id,action) values(null,new.id,'cuenta_creada');
 return new;
end;$$;
revoke all on function public.on_auth_user_created() from public,anon,authenticated;
create trigger after_auth_user_created after insert on auth.users for each row execute function public.on_auth_user_created();
create function public.profile_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 new.updated_at=now();
 insert into public.user_audit(actor_id,target_id,action,details) values(auth.uid(),new.id,
 case when new.status='eliminado' and old.status<>'eliminado' then 'usuario_dado_de_baja' when new.role<>old.role then 'rol_modificado' when new.status<>old.status then 'estado_modificado' else 'perfil_actualizado' end,
 jsonb_build_object('rol_anterior',old.role,'rol_nuevo',new.role,'estado_anterior',old.status,'estado_nuevo',new.status));
 return new;
end;$$;
revoke all on function public.profile_changed() from public,anon,authenticated;
create trigger before_profile_change before update on public.profiles for each row execute function public.profile_changed();
create function public.admin_update_user(target uuid,p_name text,p_phone text,p_role public.app_role,p_status public.account_status,p_delete boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare old_user public.profiles;
begin
 -- Serializa los cambios de rol/estado y revalida permisos dentro de la transacción.
 perform pg_advisory_xact_lock(72491308);
 if not public.is_admin() then raise exception 'Solo un administrador activo puede modificar usuarios.' using errcode='42501'; end if;
 select * into old_user from public.profiles where id=target for update;
 if not found or old_user.status='eliminado' then raise exception 'Usuario no disponible.'; end if;
 if target=auth.uid() and (p_delete or p_role is distinct from old_user.role or p_status is distinct from old_user.status) then raise exception 'No puedes cambiar tu propio rol, desactivarte ni darte de baja.'; end if;
 if old_user.role='administrador' and old_user.status='activo' and (p_delete or p_role<>'administrador' or p_status<>'activo') and (select count(*) from public.profiles where role='administrador' and status='activo')<=1 then raise exception 'Debe existir al menos un administrador activo.'; end if;
 if p_delete then
   update public.profiles set status='eliminado',deleted_at=now() where id=target;
 else
   if p_name is null or char_length(trim(p_name)) not between 3 and 100 or p_phone is null or char_length(p_phone)>20 or p_phone !~ '^[+0-9 ()-]*$' or p_role is null or p_status is null or p_status='eliminado' then raise exception 'Datos de usuario inválidos.'; end if;
   update public.profiles set full_name=trim(p_name),phone=trim(p_phone),role=p_role,status=p_status where id=target;
 end if;
end;$$;
revoke all on function public.admin_update_user(uuid,text,text,public.app_role,public.account_status,boolean) from public,anon;
grant execute on function public.admin_update_user(uuid,text,text,public.app_role,public.account_status,boolean) to authenticated;
-- Mantener correo consistente incluso si se cambia desde Supabase Auth.
create function public.sync_auth_email() returns trigger language plpgsql security definer set search_path='' as $$
begin update public.profiles set email=new.email where id=new.id; return new; end;$$;
revoke all on function public.sync_auth_email() from public,anon,authenticated;
create trigger auth_email_changed after update of email on auth.users for each row when(old.email is distinct from new.email) execute function public.sync_auth_email();
commit;
