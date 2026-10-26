-- Intentos de pago con Yape (Mercado Pago Orders) + bloqueo atómico del horario
-- Ejecutar UNA vez en Supabase → SQL Editor, ANTES de desplegar el backend nuevo.
-- No borra datos; es seguro volver a ejecutarlo.
--
-- Cada cobro queda registrado aquí ANTES de llamar a Mercado Pago:
--   * reserva el horario mientras el pago está en curso (nadie más puede tomarlo),
--   * guarda la X-Idempotency-Key para que un reintento técnico no cobre dos veces,
--   * guarda los IDs de Mercado Pago (orden, pago, request-id) para soporte y conciliación,
--   * si el pago se aprobó pero falló guardar la cita, conserva los datos para recrearla.
--
-- estado: procesando | aprobado | confirmado | rechazado | error | verificando | liberado
--   procesando  → en curso (bloquea el horario)
--   aprobado    → Mercado Pago aprobó, falta crear/actualizar la reserva (bloquea el horario)
--   verificando → no se sabe si se cobró (timeout/red/5xx/pendiente): bloquea hasta conciliar
--   confirmado  → pago aprobado y reserva guardada
--   rechazado   → Mercado Pago no aprobó (p. ej. high_risk). No hubo cobro
--   error       → la solicitud no llegó a procesarse. No hubo cobro
--   liberado    → un administrador lo revisó y liberó el horario

create table if not exists public.pagos_yape (
  id                  uuid primary key default gen_random_uuid(),
  clave_idempotencia  text not null unique,
  huella              text not null,
  tipo                text not null check (tipo in ('adelanto', 'saldo')),
  referencia          text not null,
  monto               numeric(10, 2) not null,
  estado              text not null default 'procesando',
  fecha_cita          text,
  inicio_min          integer,
  fin_min             integer,
  reserva_id          text,
  reserva_payload     jsonb,
  mp_http_status      integer,
  mp_order_id         text,
  mp_order_status     text,
  mp_payment_id       text,
  mp_payment_status   text,
  mp_status_detail    text,
  mp_request_id       text,
  mp_error_code       text,
  conciliaciones      integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists pagos_yape_referencia_idx on public.pagos_yape (referencia);
create index if not exists pagos_yape_order_idx on public.pagos_yape (mp_order_id);
create index if not exists pagos_yape_activos_idx on public.pagos_yape (fecha_cita)
  where estado in ('procesando', 'aprobado', 'verificando');

-- Solo el backend (service_role) accede: RLS activado y sin políticas para anon/authenticated
alter table public.pagos_yape enable row level security;
revoke all on public.pagos_yape from anon, authenticated;

-- "09:30 a. m.", "09:30 AM" o "21:30" → minutos desde medianoche (igual que normalizarHora en server.js)
create or replace function public.hora_a_minutos(p text)
returns integer
language plpgsql
immutable
as $$
declare
  m text[];
  h integer;
begin
  m := regexp_match(lower(coalesce(p, '')), '(\d{1,2}):(\d{2})\s*([ap])?');
  if m is null then return null; end if;
  h := m[1]::integer;
  if m[3] = 'p' and h < 12 then h := h + 12; end if;
  if m[3] = 'a' and h = 12 then h := 0; end if;
  return h * 60 + m[2]::integer;
end;
$$;

-- Registra el intento y bloquea el horario en una sola transacción.
-- Un candado por fecha (pg_advisory_xact_lock) serializa a los clientes que reservan el mismo día,
-- así dos personas no pueden pasar la verificación de disponibilidad a la vez.
-- Devuelve { resultado: 'nuevo' | 'existente' | 'clave_reutilizada' | 'ocupado', pago }
create or replace function public.iniciar_pago_yape(
  p_clave text,
  p_huella text,
  p_tipo text,
  p_referencia text,
  p_monto numeric,
  p_fecha text,
  p_inicio integer,
  p_fin integer,
  p_reserva_id text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pago public.pagos_yape;
begin
  if p_tipo = 'adelanto' then
    perform pg_advisory_xact_lock(hashtext('turno:' || p_fecha));
  else
    perform pg_advisory_xact_lock(hashtext('saldo:' || coalesce(p_reserva_id, '')));
  end if;

  -- Reintento con la misma clave: se devuelve el intento original (nunca se cobra de nuevo)
  select * into v_pago from public.pagos_yape where clave_idempotencia = p_clave;
  if found then
    return jsonb_build_object(
      'resultado', case when v_pago.huella = p_huella then 'existente' else 'clave_reutilizada' end,
      'pago', to_jsonb(v_pago)
    );
  end if;

  if p_tipo = 'adelanto' then
    if exists (
      select 1 from public.reservas r
      where r.fecha_cita::text = p_fecha
        and r.estado is distinct from 'cancelled'
        and public.hora_a_minutos(r.hora_cita) < p_fin
        and public.hora_a_minutos(r.hora_cita) + coalesce(r.duracion_min, 30) > p_inicio
    ) or exists (
      select 1 from public.pagos_yape p
      where p.tipo = 'adelanto'
        and p.fecha_cita = p_fecha
        and p.estado in ('procesando', 'aprobado', 'verificando')
        and p.inicio_min < p_fin
        and p.fin_min > p_inicio
    ) then
      return jsonb_build_object('resultado', 'ocupado');
    end if;
  else
    -- El mismo saldo no puede cobrarse dos veces
    if exists (
      select 1 from public.pagos_yape p
      where p.tipo = 'saldo'
        and p.reserva_id = p_reserva_id
        and p.estado in ('procesando', 'aprobado', 'verificando', 'confirmado')
    ) then
      return jsonb_build_object('resultado', 'ocupado');
    end if;
  end if;

  insert into public.pagos_yape (
    clave_idempotencia, huella, tipo, referencia, monto, estado,
    fecha_cita, inicio_min, fin_min, reserva_id, reserva_payload
  ) values (
    p_clave, p_huella, p_tipo, p_referencia, p_monto, 'procesando',
    case when p_tipo = 'adelanto' then p_fecha end,
    case when p_tipo = 'adelanto' then p_inicio end,
    case when p_tipo = 'adelanto' then p_fin end,
    p_reserva_id, p_payload
  )
  returning * into v_pago;

  return jsonb_build_object('resultado', 'nuevo', 'pago', to_jsonb(v_pago));
end;
$$;

revoke all on function public.iniciar_pago_yape(text, text, text, text, numeric, text, integer, integer, text, jsonb) from public, anon, authenticated;
grant execute on function public.iniciar_pago_yape(text, text, text, text, numeric, text, integer, integer, text, jsonb) to service_role;
