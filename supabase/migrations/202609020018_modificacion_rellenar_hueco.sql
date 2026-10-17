begin;

-- ============================================================
-- 1. PREFIJO AUTOMÁTICO DE ALMACÉN
-- ============================================================

create unique index if not exists almacen_prefijo_rfid_uq
  on public.almacen (prefijo_rfid);

create or replace function public.fn_auto_prefijo_almacen()
returns trigger
language plpgsql
as $$
declare
  v_pref text;
  v_candidato text;
  v_suffix integer := 1;
begin
  if tg_op = 'UPDATE'
     and (new.prefijo_rfid is null or trim(new.prefijo_rfid) = '') then
    new.prefijo_rfid := old.prefijo_rfid;
  end if;

  if new.prefijo_rfid is null or trim(new.prefijo_rfid) = '' then
    select string_agg(upper(left(w, 3)), '')
    into v_pref
    from regexp_split_to_table(
      regexp_replace(
        translate(new.nombre, 'ÁÉÍÓÚáéíóúÑñ', 'AEIOUaeiouNn'),
        '[^A-Za-z0-9 ]', '', 'g'
      ),
      '\s+'
    ) as w
    where w <> '';

    if v_pref is null or v_pref = '' then
      v_pref := 'ALM';
    end if;

    v_candidato := v_pref;

    while exists (
      select 1 from public.almacen a
      where a.prefijo_rfid = v_candidato
        and a.id_almacen is distinct from new.id_almacen
    ) loop
      v_suffix := v_suffix + 1;
      v_candidato := v_pref || v_suffix::text;
    end loop;

    new.prefijo_rfid := v_candidato;
  else
    new.prefijo_rfid := upper(trim(new.prefijo_rfid));
  end if;

  if tg_op = 'UPDATE'
     and old.prefijo_rfid is not null
     and new.prefijo_rfid is distinct from old.prefijo_rfid
     and exists (
       select 1 from public.etiqueta_rfid e
       where e.uid_tag ~ ('^' || old.prefijo_rfid || '[0-9]{5,}$')
     ) then
    raise exception
      'No se puede cambiar el prefijo de "%": ya existen etiquetas emitidas con %.',
      old.nombre, old.prefijo_rfid;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_almacen_auto_prefijo on public.almacen;
create trigger trg_almacen_auto_prefijo
before insert or update on public.almacen
for each row
execute function public.fn_auto_prefijo_almacen();

-- Dispara el trigger para almacenes sin prefijo (ej. Construcción)
update public.almacen
set nombre = nombre
where prefijo_rfid is null or trim(prefijo_rfid) = '';


-- ============================================================
-- 2. HISTORIAL DE ASIGNACIONES DE CADA CÓDIGO RFID
-- ============================================================

create table if not exists public.etiqueta_asignacion_historial (
  id_historial bigint generated always as identity primary key,
  id_etiqueta bigint not null
    references public.etiqueta_rfid (id_etiqueta) on delete cascade,
  uid_tag varchar not null,
  id_producto bigint references public.producto (id_producto) on delete set null,
  tipo_paleta public.tipo_paleta,
  id_almacen bigint references public.almacen (id_almacen) on delete set null,
  cantidad_paquetes integer,
  cantidad_actual numeric,
  fecha_asignacion timestamptz not null,
  fecha_cierre timestamptz not null default now(),
  notas_cierre text
);

create index if not exists etiqueta_asignacion_historial_uid_idx
  on public.etiqueta_asignacion_historial (uid_tag, fecha_cierre desc);

alter table public.etiqueta_asignacion_historial enable row level security;

drop policy if exists etiqueta_asignacion_historial_lectura
  on public.etiqueta_asignacion_historial;
create policy etiqueta_asignacion_historial_lectura
on public.etiqueta_asignacion_historial
for select
to authenticated
using (
  exists (
    select 1 from public.usuario u
    where u.auth_user_id = auth.uid() and u.activo = true
  )
);

create or replace function public.trg_archivar_asignacion_etiqueta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.estado = 'ACTIVA' and new.estado <> 'ACTIVA' then
    insert into public.etiqueta_asignacion_historial (
      id_etiqueta, uid_tag, id_producto, tipo_paleta, id_almacen,
      cantidad_paquetes, cantidad_actual, fecha_asignacion, notas_cierre
    )
    values (
      old.id_etiqueta, old.uid_tag, old.id_producto, old.tipo_paleta,
      old.id_almacen_actual, old.cantidad_paquetes, old.cantidad_actual,
      old.fecha_enrolamiento, new.notas
    );
  end if;
  return new;
end;
$$;

drop trigger if exists archivar_asignacion_etiqueta on public.etiqueta_rfid;
create trigger archivar_asignacion_etiqueta
before update on public.etiqueta_rfid
for each row
execute function public.trg_archivar_asignacion_etiqueta();


-- ============================================================
-- 3. GENERADOR: MENOR HUECO LIBRE (CON BLOQUEO)
--    Libre = no existe o está VACIA.
--    Ocupado = ACTIVA o EXTRAVIADA.
-- ============================================================

create or replace function public.generar_uid_rfid(p_id_almacen bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefijo text;
  v_ocupadas integer;
  v_numero integer;
begin
  select a.prefijo_rfid
  into v_prefijo
  from public.almacen a
  where a.id_almacen = p_id_almacen
    and a.activo = true;

  if v_prefijo is null or trim(v_prefijo) = '' then
    raise exception
      'El almacén % no existe, está inactivo o no tiene prefijo RFID.',
      p_id_almacen;
  end if;

  -- Serializa la asignación de códigos por almacén hasta el fin de la transacción
  perform pg_advisory_xact_lock(
    hashtextextended('generar_uid_rfid:' || p_id_almacen::text, 0)
  );

  select count(*)
  into v_ocupadas
  from public.etiqueta_rfid
  where estado <> 'VACIA'
    and uid_tag ~ ('^' || v_prefijo || '[0-9]{5,}$');

  -- Con N ocupadas, siempre hay un hueco entre 1 y N+1
  select min(n)
  into v_numero
  from generate_series(1, v_ocupadas + 1) as n
  where not exists (
    select 1
    from public.etiqueta_rfid e
    where e.uid_tag = v_prefijo || lpad(n::text, 5, '0')
      and e.estado <> 'VACIA'
  );

  return v_prefijo || lpad(v_numero::text, 5, '0');
end;
$$;

revoke all on function public.generar_uid_rfid(bigint)
from public, anon, authenticated;

-- Sugerencia de solo lectura para la app (botón "Sugerir")
create or replace function public.sugerir_uid_rfid(p_id_almacen bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión.';
  end if;
  return public.generar_uid_rfid(p_id_almacen);
end;
$$;

grant execute on function public.sugerir_uid_rfid(bigint) to authenticated;


-- ============================================================
-- 4. ASIGNACIÓN SEGURA DE UN CÓDIGO (NUEVO O REACTIVADO)
-- ============================================================

create or replace function public._asignar_etiqueta_rfid(
  p_uid text,
  p_id_producto bigint,
  p_tipo public.tipo_paleta,
  p_cajas integer,
  p_unidades numeric,
  p_id_almacen bigint,
  p_notas text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  insert into public.etiqueta_rfid (
    uid_tag, id_producto, tipo_paleta, cantidad_paquetes,
    cantidad_actual, estado, id_almacen_actual, id_celda,
    notas, fecha_enrolamiento
  )
  values (
    p_uid, p_id_producto, p_tipo, p_cajas, p_unidades,
    'ACTIVA'::public.etiqueta_estado, p_id_almacen, null,
    p_notas, now()
  )
  on conflict (uid_tag)
  do update set
    id_producto = excluded.id_producto,
    tipo_paleta = excluded.tipo_paleta,
    cantidad_paquetes = excluded.cantidad_paquetes,
    cantidad_actual = excluded.cantidad_actual,
    estado = 'ACTIVA'::public.etiqueta_estado,
    id_almacen_actual = excluded.id_almacen_actual,
    id_celda = null,
    notas = excluded.notas,
    fecha_enrolamiento = now()
  where public.etiqueta_rfid.estado = 'VACIA'
  returning id_etiqueta into v_id;

  if v_id is null then
    raise exception 'El código % no está disponible: ya está en uso.', p_uid;
  end if;

  return v_id;
end;
$$;

revoke all on function public._asignar_etiqueta_rfid(
  text, bigint, public.tipo_paleta, integer, numeric, bigint, text
) from public, anon, authenticated;


-- ============================================================
-- 5. TRANSFERENCIA ENTRE ALMACENES
-- ============================================================

create or replace function public.transferir_carga_entre_almacenes(
  p_uid_origen text,
  p_id_almacen_origen bigint,
  p_id_almacen_destino bigint,
  p_motivo text default 'Transferencia entre almacenes'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id_usuario bigint;
  v_origen public.etiqueta_rfid%rowtype;
  v_pucho_dest public.etiqueta_rfid%rowtype;
  v_hay_pucho_dest boolean := false;

  v_sku text;
  v_nombre_destino text;
  v_unidades_por_caja integer;
  v_cajas_por_paleta integer;

  v_total_cajas integer;
  v_resto integer;

  v_uid_principal text;
  v_uid_resto text;
  v_uid_cerrado text;
  v_id_etiqueta_destino bigint;
  v_id_etiqueta_resto bigint;
  v_alerta boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para transferir carga.';
  end if;

  if p_id_almacen_origen = p_id_almacen_destino then
    raise exception 'El almacén destino debe ser distinto del almacén de origen.';
  end if;

  select u.id_usuario into v_id_usuario
  from public.usuario u
  where u.auth_user_id = auth.uid() and u.activo = true
  limit 1;

  if not found then
    raise exception 'Usuario no válido o inactivo.';
  end if;

  select a.nombre into v_nombre_destino
  from public.almacen a
  where a.id_almacen = p_id_almacen_destino and a.activo = true;

  if not found then
    raise exception 'El almacén destino (#%) no existe o está inactivo.',
      p_id_almacen_destino;
  end if;

  select * into v_origen
  from public.etiqueta_rfid
  where uid_tag = trim(p_uid_origen)
    and id_almacen_actual = p_id_almacen_origen
    and estado = 'ACTIVA'
  for update;

  if not found then
    raise exception 'La etiqueta % no está activa en el almacén origen.', p_uid_origen;
  end if;

  if v_origen.cantidad_actual <= 0 or v_origen.cantidad_paquetes <= 0 then
    raise exception 'La etiqueta % no tiene cantidad para transferir.', p_uid_origen;
  end if;

  select p.sku into v_sku
  from public.producto p
  where p.id_producto = v_origen.id_producto;

  select
    re.unidades_por_caja,
    coalesce(
      re.cajas_por_camada * re.numero_camadas,
      re.cajas_por_camita * re.camitas_por_paleta
    )
  into v_unidades_por_caja, v_cajas_por_paleta
  from public.regla_empaque re
  where re.id_producto = v_origen.id_producto;

  if not found
     or coalesce(v_unidades_por_caja, 0) <= 0
     or coalesce(v_cajas_por_paleta, 0) <= 0 then
    raise exception 'El producto % no tiene una regla de empaque válida.', v_sku;
  end if;

  -- CASO 1: PALETA COMPLETA
  if v_origen.tipo_paleta = 'COMPLETO' then

    v_uid_principal := public.generar_uid_rfid(p_id_almacen_destino);

    v_id_etiqueta_destino := public._asignar_etiqueta_rfid(
      v_uid_principal, v_origen.id_producto, 'COMPLETO',
      v_origen.cantidad_paquetes, v_origen.cantidad_actual,
      p_id_almacen_destino, 'Transferida desde ' || v_origen.uid_tag
    );

  -- CASO 2: PUCHO
  else

    select * into v_pucho_dest
    from public.etiqueta_rfid
    where id_producto = v_origen.id_producto
      and id_almacen_actual = p_id_almacen_destino
      and tipo_paleta = 'PUCHO'
      and estado = 'ACTIVA'
    for update;

    v_hay_pucho_dest := found;

    v_total_cajas := v_origen.cantidad_paquetes
      + case when v_hay_pucho_dest then v_pucho_dest.cantidad_paquetes else 0 end;

    if v_total_cajas < v_cajas_por_paleta then

      if v_hay_pucho_dest then
        update public.etiqueta_rfid
        set cantidad_paquetes = v_total_cajas,
            cantidad_actual = v_total_cajas * v_unidades_por_caja,
            notas = 'Pucho consolidado (+' || v_origen.cantidad_paquetes
                    || ' cajas de ' || v_origen.uid_tag || ')'
        where id_etiqueta = v_pucho_dest.id_etiqueta;

        v_uid_principal := v_pucho_dest.uid_tag;
        v_id_etiqueta_destino := v_pucho_dest.id_etiqueta;
      else
        v_uid_principal := public.generar_uid_rfid(p_id_almacen_destino);

        v_id_etiqueta_destino := public._asignar_etiqueta_rfid(
          v_uid_principal, v_origen.id_producto, 'PUCHO',
          v_origen.cantidad_paquetes, v_origen.cantidad_actual,
          p_id_almacen_destino, 'Pucho transferido desde ' || v_origen.uid_tag
        );
      end if;

    else
      -- Límite alcanzado: pasa a paleta completa
      if v_hay_pucho_dest then
        v_uid_cerrado := v_pucho_dest.uid_tag;

        update public.etiqueta_rfid
        set estado = 'VACIA',
            cantidad_paquetes = 0,
            cantidad_actual = 0,
            id_almacen_actual = null,
            id_celda = null,
            notas = trim(coalesce(notas, '') || ' Consolidado en paleta completa')
        where id_etiqueta = v_pucho_dest.id_etiqueta;
      end if;

      v_uid_principal := public.generar_uid_rfid(p_id_almacen_destino);

      v_id_etiqueta_destino := public._asignar_etiqueta_rfid(
        v_uid_principal, v_origen.id_producto, 'COMPLETO',
        v_cajas_por_paleta, v_cajas_por_paleta * v_unidades_por_caja,
        p_id_almacen_destino, 'Paleta completa formada al consolidar puchos'
      );

      v_resto := v_total_cajas - v_cajas_por_paleta;

      if v_resto > 0 then
        v_uid_resto := public.generar_uid_rfid(p_id_almacen_destino);

        v_id_etiqueta_resto := public._asignar_etiqueta_rfid(
          v_uid_resto, v_origen.id_producto, 'PUCHO',
          v_resto, v_resto * v_unidades_por_caja,
          p_id_almacen_destino,
          'Remanente tras formar paleta completa ' || v_uid_principal
        );
      end if;

      insert into public.alerta_sistema (
        tipo, id_almacen, id_producto, id_etiqueta, mensaje
      )
      values (
        'PUCHO_COMPLETADO',
        p_id_almacen_destino,
        v_origen.id_producto,
        v_id_etiqueta_destino,
        format(
          'En %s, los puchos de %s alcanzaron el límite de %s cajas. Se creó la paleta completa %s%s. Verificar físicamente.',
          v_nombre_destino, v_sku, v_cajas_por_paleta, v_uid_principal,
          case when v_uid_resto is not null
               then ' y un nuevo pucho ' || v_uid_resto
               else '' end
        )
      );

      v_alerta := true;
    end if;

  end if;

  -- Cerrar etiqueta de origen (queda libre para rellenar en su almacén)
  update public.etiqueta_rfid
  set estado = 'VACIA',
      cantidad_paquetes = 0,
      cantidad_actual = 0,
      id_almacen_actual = null,
      id_celda = null,
      notas = trim(coalesce(notas, '') || ' Transferida a ' || v_uid_principal)
  where id_etiqueta = v_origen.id_etiqueta;

  -- Kardex: salida
  insert into public.movimiento (
    id_usuario, id_etiqueta, id_producto, tipo,
    cantidad_afectada, destino_almacen, motivo
  )
  values (
    v_id_usuario, v_origen.id_etiqueta, v_origen.id_producto,
    'DESPACHO_COMPLETO'::public.movimiento_tipo,
    v_origen.cantidad_actual, p_id_almacen_destino,
    format('Transferencia: sale %s, entra %s. %s',
           v_origen.uid_tag, v_uid_principal, p_motivo)
  );

  -- Kardex: ingreso
  insert into public.movimiento (
    id_usuario, id_etiqueta, id_producto, tipo,
    cantidad_afectada, destino_almacen, motivo
  )
  values (
    v_id_usuario, v_id_etiqueta_destino, v_origen.id_producto,
    case when v_origen.tipo_paleta = 'COMPLETO'
         then 'INGRESO_COMPLETO'::public.movimiento_tipo
         else 'INGRESO_PUCHO'::public.movimiento_tipo end,
    v_origen.cantidad_actual, p_id_almacen_destino,
    format('Transferencia: ingresa a %s desde %s. %s',
           v_uid_principal, v_origen.uid_tag, p_motivo)
  );

  -- Inventario origen
  update public.inventario
  set stock_real = greatest(0, stock_real - v_origen.cantidad_actual),
      estado_semaforo = case
        when greatest(0, stock_real - v_origen.cantidad_actual) <= 0 then 'ROJO'
        when greatest(0, stock_real - v_origen.cantidad_actual) <= stock_minimo then 'AMARILLO'
        else 'VERDE'
      end
  where id_producto = v_origen.id_producto
    and id_almacen = p_id_almacen_origen;

  -- Inventario destino
  insert into public.inventario (
    id_producto, id_almacen, stock_real, stock_minimo,
    consumo_abs, estado_semaforo
  )
  values (
    v_origen.id_producto, p_id_almacen_destino,
    v_origen.cantidad_actual, 0, 0, 'VERDE'
  )
  on conflict (id_producto, id_almacen)
  do update set
    stock_real = public.inventario.stock_real + excluded.stock_real,
    estado_semaforo = case
      when public.inventario.stock_real + excluded.stock_real <= 0 then 'ROJO'
      when public.inventario.stock_real + excluded.stock_real
           <= public.inventario.stock_minimo then 'AMARILLO'
      else 'VERDE'
    end;

  return jsonb_build_object(
    'ok', true,
    'uid_origen', v_origen.uid_tag,
    'uid_destino', v_uid_principal,
    'uid_pucho_restante', v_uid_resto,
    'uid_pucho_cerrado', v_uid_cerrado,
    'alerta_generada', v_alerta,
    'unidades_transferidas', v_origen.cantidad_actual,
    'mensaje', case
      when v_alerta then 'Transferencia registrada. Se completó una paleta: verificar físicamente.'
      else 'Transferencia entre almacenes registrada exitosamente.'
    end
  );
end;
$$;

grant execute
on function public.transferir_carga_entre_almacenes(text, bigint, bigint, text)
to authenticated;

notify pgrst, 'reload schema';

commit;