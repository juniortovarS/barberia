-- ⚠️ URGENTE: elimina la función que permitía cambiar la contraseña de CUALQUIER cuenta
-- (incluida la del administrador) conociendo solo su correo.
-- La web ahora usa el flujo seguro de Supabase: enlace de recuperación enviado al correo.
-- Ejecutar en Supabase → SQL Editor.

drop function if exists public.reset_user_password(text, text);

-- Comprobación: no debe devolver filas
select proname, pg_get_function_identity_arguments(oid)
from pg_proc
where proname = 'reset_user_password';
