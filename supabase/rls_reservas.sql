-- Seguridad de la tabla "reservas" (Row Level Security)
-- Ejecutar en Supabase → SQL Editor.
-- ANTES: revisa en Authentication → Policies si "reservas" ya tiene políticas antiguas
-- que permitan todo (ej. "Enable insert for anon") y elimínalas; las políticas se suman entre sí.
--
-- Resultado:
--   * Visitantes anónimos: no pueden leer ni escribir reservas (el backend usa la service_role y no se ve afectado).
--   * Clientes logueados: solo ven sus propias reservas y solo pueden cambiarlas a "cancelled".
--   * Administradores: acceso completo (panel admin).

alter table public.reservas enable row level security;

create or replace function public.es_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
      or lower(coalesce(auth.jwt() ->> 'email', '')) in ('juniortovaradmin@gmail.com', 'juniortovar601@gmail.com');
$$;

drop policy if exists "admin_todo_reservas" on public.reservas;
create policy "admin_todo_reservas" on public.reservas
  for all to authenticated
  using (public.es_admin())
  with check (public.es_admin());

drop policy if exists "cliente_ve_sus_reservas" on public.reservas;
create policy "cliente_ve_sus_reservas" on public.reservas
  for select to authenticated
  using (lower(email) = lower(auth.jwt() ->> 'email'));

drop policy if exists "cliente_cancela_sus_reservas" on public.reservas;
create policy "cliente_cancela_sus_reservas" on public.reservas
  for update to authenticated
  using (lower(email) = lower(auth.jwt() ->> 'email'))
  with check (lower(email) = lower(auth.jwt() ->> 'email') and estado = 'cancelled');

-- Los usuarios logueados solo pueden modificar la columna "estado" (el resto de columnas queda protegido)
revoke update on public.reservas from anon, authenticated;
grant update (estado) on public.reservas to authenticated;
revoke insert, delete on public.reservas from anon;
