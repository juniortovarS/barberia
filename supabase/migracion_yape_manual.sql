-- Yape directo (pago manual verificado por el administrador)
-- Ejecutar UNA vez en Supabase → SQL Editor, ANTES de desplegar el backend nuevo.
-- No borra datos; es seguro volver a ejecutarlo.
--
-- Flujo: el cliente yapea al número de la barbería, sube la captura y su reserva queda "pending"
-- (el horario queda bloqueado). El administrador la aprueba o la rechaza desde el panel.

alter table public.reservas
  -- 'yape_mp' (código de aprobación vía Mercado Pago) | 'yape_manual' (Yape directo) | null (antiguas / panel)
  add column if not exists pago_metodo          text,
  -- Nº de operación que muestra la constancia de Yape
  add column if not exists yape_operacion       text,
  add column if not exists pago_revisado_por    text,
  add column if not exists pago_revisado_en     timestamptz,
  add column if not exists pago_motivo_rechazo  text;

-- Una misma constancia no puede usarse para dos reservas activas
create unique index if not exists reservas_yape_operacion_unica
  on public.reservas (yape_operacion)
  where yape_operacion is not null and estado is distinct from 'cancelled';

-- Pagos por verificar (panel admin)
create index if not exists reservas_pago_pendiente_idx
  on public.reservas (fecha_registro)
  where estado = 'pending' and pago_metodo = 'yape_manual';

-- Crea la reserva "pending" verificando el cruce de horarios en la misma transacción.
-- Usa el mismo candado por fecha que iniciar_pago_yape: los dos flujos no pueden tomar el mismo turno.
-- Devuelve { resultado: 'nuevo' | 'ocupado' | 'operacion_repetida', reserva }
create or replace function public.reservar_yape_manual(p_reserva jsonb, p_inicio integer, p_fin integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fecha text := p_reserva ->> 'fecha_cita';
  v_reserva public.reservas;
begin
  perform pg_advisory_xact_lock(hashtext('turno:' || v_fecha));

  if exists (
    select 1 from public.reservas r
    where r.fecha_cita::text = v_fecha
      and r.estado is distinct from 'cancelled'
      and public.hora_a_minutos(r.hora_cita) < p_fin
      and public.hora_a_minutos(r.hora_cita) + coalesce(r.duracion_min, 30) > p_inicio
  ) or exists (
    select 1 from public.pagos_yape p
    where p.tipo = 'adelanto'
      and p.fecha_cita = v_fecha
      and p.estado in ('procesando', 'aprobado', 'verificando')
      and p.inicio_min < p_fin
      and p.fin_min > p_inicio
  ) then
    return jsonb_build_object('resultado', 'ocupado');
  end if;

  begin
    insert into public.reservas (
      nombre, celular, email, fecha_cita, hora_cita, fecha_registro, codigo, estado, voucher_url,
      servicio_id, servicio, duracion_min, precio, descuento_pct, total, adelanto, saldo, saldo_estado,
      pago_metodo, yape_operacion
    )
    select
      nombre, celular, email, fecha_cita, hora_cita, fecha_registro, codigo, estado, voucher_url,
      servicio_id, servicio, duracion_min, precio, descuento_pct, total, adelanto, saldo, saldo_estado,
      pago_metodo, yape_operacion
    from jsonb_populate_record(null::public.reservas, p_reserva)
    returning * into v_reserva;
  exception when unique_violation then
    return jsonb_build_object('resultado', 'operacion_repetida');
  end;

  return jsonb_build_object('resultado', 'nuevo', 'reserva', to_jsonb(v_reserva));
end;
$$;

revoke all on function public.reservar_yape_manual(jsonb, integer, integer) from public, anon, authenticated;
grant execute on function public.reservar_yape_manual(jsonb, integer, integer) to service_role;
