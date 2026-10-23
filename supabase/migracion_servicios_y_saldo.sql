-- Servicios con precio/duración + adelanto y pago del restante
-- Ejecutar UNA vez en Supabase → SQL Editor (no borra datos; es seguro volver a ejecutarlo).

alter table public.reservas
  add column if not exists servicio_id      text,
  add column if not exists servicio         text,
  add column if not exists duracion_min     integer default 30,
  add column if not exists precio           numeric(10, 2),
  add column if not exists descuento_pct    integer default 0,
  add column if not exists total            numeric(10, 2),
  add column if not exists adelanto         numeric(10, 2) default 0,
  add column if not exists saldo            numeric(10, 2) default 0,
  -- 'pendiente' | 'pagado' | 'no_aplica'
  add column if not exists saldo_estado     text default 'no_aplica',
  -- 'yape' | 'efectivo'
  add column if not exists saldo_metodo     text,
  add column if not exists saldo_pagado_en  timestamptz,
  add column if not exists pago_adelanto_id text,
  add column if not exists pago_saldo_id    text;

-- Búsquedas rápidas por día (agenda y disponibilidad)
create index if not exists reservas_fecha_cita_idx on public.reservas (fecha_cita);

-- Los clientes solo pueden cambiar "estado" (cancelar); montos y pagos los escribe únicamente el backend
revoke update on public.reservas from anon, authenticated;
grant update (estado) on public.reservas to authenticated;
