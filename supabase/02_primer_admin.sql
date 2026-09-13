-- 1. Regístrate desde AYNI y confirma tu correo.
-- 2. Sustituye el correo abajo por el que TÚ registraste.
-- 3. Ejecuta desde SQL Editor. Nunca desde el navegador o una API pública.
do $$
declare selected_id uuid;
begin
 select id into selected_id from public.profiles where lower(email)=lower('REEMPLAZA_CON_TU_CORREO');
 if selected_id is null then raise exception 'No existe ese correo. Regístrate primero y verifica el valor reemplazado.'; end if;
 update public.profiles set role='administrador',status='activo' where id=selected_id;
end $$;
