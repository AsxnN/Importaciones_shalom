-- ==============================================================================
-- Migración: Módulo 4 - Recepción y Conciliación Ciega RFID (RPC + RLS)
-- Sistema de inventario RFID - Importaciones Shalom
-- ==============================================================================

-- 1. Políticas RLS para Sesiones de Recepción y Lecturas RFID
alter table public.sesion_recepcion enable row level security;
alter table public.recepcion_lectura enable row level security;
alter table public.conciliacion_ciega enable row level security;
alter table public.etiqueta_rfid enable row level security;

drop policy if exists "sesion_recepcion_lectura" on public.sesion_recepcion;
create policy "sesion_recepcion_lectura" on public.sesion_recepcion
  for select to authenticated using (true);

drop policy if exists "sesion_recepcion_gestion" on public.sesion_recepcion;
create policy "sesion_recepcion_gestion" on public.sesion_recepcion
  for all to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'OPERARIO', 'AUDITOR']))
  with check (public.tiene_rol(array['ADMINISTRADOR', 'OPERARIO']));

drop policy if exists "recepcion_lectura_select" on public.recepcion_lectura;
create policy "recepcion_lectura_select" on public.recepcion_lectura
  for select to authenticated using (true);

drop policy if exists "recepcion_lectura_gestion" on public.recepcion_lectura;
create policy "recepcion_lectura_gestion" on public.recepcion_lectura
  for all to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'OPERARIO']))
  with check (public.tiene_rol(array['ADMINISTRADOR', 'OPERARIO']));

drop policy if exists "conciliacion_ciega_select" on public.conciliacion_ciega;
create policy "conciliacion_ciega_select" on public.conciliacion_ciega
  for select to authenticated using (true);

drop policy if exists "etiqueta_rfid_gestion" on public.etiqueta_rfid;
create policy "etiqueta_rfid_gestion" on public.etiqueta_rfid
  for all to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'OPERARIO']))
  with check (public.tiene_rol(array['ADMINISTRADOR', 'OPERARIO']));

-- 2. Función RPC para Recepción y Conciliación Ciega desde ESP32 / Web
create or replace function public.conciliar_recepcion(
  p_id_orden bigint,
  p_id_producto bigint,
  p_id_almacen bigint,
  p_lecturas jsonb -- Array de objetos: [{"uid": "...", "tipo": "COMPLETO"|"PUCHO", "cantidad_paquetes": N}]
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_id_usuario bigint;
  v_unidades_por_caja integer;
  v_cajas_por_paleta integer;
  v_cantidad_pedida integer := 0;
  
  v_total_paletas integer := 0;
  v_total_puchos integer := 0;
  v_total_cajas integer := 0;
  v_total_unidades numeric := 0;

  v_id_sesion bigint;
  v_item jsonb;
  v_uid text;
  v_tipo text;
  v_paquetes integer;
  v_cajas_item integer;
  v_unidades_item numeric;
  v_id_etiqueta bigint;

  v_estado_conciliacion public.conciliacion_estado;
  v_diferencia numeric;
begin
  -- 1. Validar permisos
  if not (public.tiene_rol(array['ADMINISTRADOR', 'OPERARIO'])) then
    raise exception 'Acceso denegado: rol no autorizado para recepcionar mercancía.';
  end if;

  -- 2. Obtener usuario
  select id_usuario into v_id_usuario
  from public.usuario
  where auth_user_id = auth.uid();

  -- 3. Obtener regla de empaque del SKU
  select
    coalesce(r.unidades_por_caja, 1),
    (coalesce(r.cajas_por_camada, r.cajas_por_camita, 1) * coalesce(r.numero_camadas, r.camitas_por_paleta, 1))
  into v_unidades_por_caja, v_cajas_por_paleta
  from public.producto p
  left join public.regla_empaque r on r.id_producto = p.id_producto
  where p.id_producto = p_id_producto;

  v_unidades_por_caja := coalesce(v_unidades_por_caja, 1);
  v_cajas_por_paleta := coalesce(v_cajas_por_paleta, 1);

  -- 4. Obtener cantidad pactada en la orden de importación
  select coalesce(cantidad_pedida, 0) into v_cantidad_pedida
  from public.detalle_orden
  where id_orden = p_id_orden and id_producto = p_id_producto;

  -- 5. Contar paletas completas y puchos del lote
  for v_item in select * from jsonb_array_elements(p_lecturas)
  loop
    v_tipo := upper(coalesce(v_item->>'tipo', 'COMPLETO'));
    v_paquetes := coalesce((v_item->>'cantidad_paquetes')::integer, 0);

    if v_tipo = 'COMPLETO' then
      v_total_paletas := v_total_paletas + 1;
    else
      v_total_puchos := v_total_puchos + v_paquetes;
    end if;
  end loop;

  v_total_cajas := (v_total_paletas * v_cajas_por_paleta) + v_total_puchos;
  v_total_unidades := v_total_cajas * v_unidades_por_caja;

  -- 6. Crear Sesión de Recepción
  insert into public.sesion_recepcion (
    id_orden,
    id_producto,
    id_almacen,
    id_usuario,
    estado,
    total_paletas_completas,
    total_paquetes_puchos,
    fecha_inicio,
    fecha_finalizacion
  )
  values (
    p_id_orden,
    p_id_producto,
    p_id_almacen,
    v_id_usuario,
    'FINALIZADA',
    v_total_paletas,
    v_total_puchos,
    now(),
    now()
  )
  returning id_sesion into v_id_sesion;

  -- 7. Registrar cada lectura y enrolar/actualizar etiquetas RFID
  for v_item in select * from jsonb_array_elements(p_lecturas)
  loop
    v_uid := trim(v_item->>'uid');
    v_tipo := upper(coalesce(v_item->>'tipo', 'COMPLETO'));
    v_paquetes := coalesce((v_item->>'cantidad_paquetes')::integer, 0);

    if v_tipo = 'COMPLETO' then
      v_cajas_item := v_cajas_por_paleta;
      v_unidades_item := v_cajas_por_paleta * v_unidades_por_caja;
    else
      v_cajas_item := v_paquetes;
      v_unidades_item := v_paquetes * v_unidades_por_caja;
    end if;

    -- Enrolar o actualizar etiqueta RFID
    insert into public.etiqueta_rfid (
      uid_tag,
      id_producto,
      tipo_paleta,
      cantidad_paquetes,
      cantidad_actual,
      estado,
      id_almacen_actual
    )
    values (
      v_uid,
      p_id_producto,
      v_tipo::public.tipo_paleta,
      v_cajas_item,
      v_unidades_item,
      'ACTIVA',
      p_id_almacen
    )
    on conflict (uid_tag) do update set
      id_producto = excluded.id_producto,
      tipo_paleta = excluded.tipo_paleta,
      cantidad_paquetes = excluded.cantidad_paquetes,
      cantidad_actual = excluded.cantidad_actual,
      estado = 'ACTIVA',
      id_almacen_actual = excluded.id_almacen_actual
    returning id_etiqueta into v_id_etiqueta;

    -- Registrar detalle en recepcion_lectura
    insert into public.recepcion_lectura (
      id_sesion,
      id_etiqueta,
      uid_tag,
      tipo_carga,
      cantidad_paquetes,
      cantidad_unidades,
      valido
    )
    values (
      v_id_sesion,
      v_id_etiqueta,
      v_uid,
      v_tipo::public.tipo_paleta,
      v_cajas_item,
      v_unidades_item,
      true
    );
  end loop;

  -- 8. Calcular Conciliación Ciega (Esperado vs Físico)
  v_diferencia := v_total_unidades - v_cantidad_pedida;

  if v_diferencia = 0 then
    v_estado_conciliacion := 'COMPLETA';
  elsif v_diferencia < 0 then
    v_estado_conciliacion := 'FALTANTES';
  else
    v_estado_conciliacion := 'SOBRANTES';
  end if;

  insert into public.conciliacion_ciega (
    id_sesion,
    tags_esperados,
    tags_leidos,
    total_paletas_completas,
    total_paquetes_puchos,
    estado
  )
  values (
    v_id_sesion,
    case
      when (v_cajas_por_paleta * v_unidades_por_caja) > 0
      then ceil(v_cantidad_pedida::numeric / (v_cajas_por_paleta * v_unidades_por_caja))::integer
      else 0
    end,
    jsonb_array_length(p_lecturas),
    v_total_paletas,
    v_total_puchos,
    v_estado_conciliacion
  );

  -- 9. Actualizar Inventario en el Almacén
  insert into public.inventario (
    id_producto, id_almacen, stock_real, stock_minimo, estado_semaforo
  )
  values (
    p_id_producto,
    p_id_almacen,
    v_total_unidades,
    (v_cajas_por_paleta * v_unidades_por_caja),
    'VERDE'
  )
  on conflict (id_producto, id_almacen) do update set
    stock_real = public.inventario.stock_real + excluded.stock_real,
    estado_semaforo = case
      when (public.inventario.stock_real + excluded.stock_real) <= 0 then 'ROJO'
      when (public.inventario.stock_real + excluded.stock_real) <= public.inventario.stock_minimo then 'AMARILLO'
      else 'VERDE'
    end;

  -- 10. Registrar Movimiento Inmutable de Ingreso
  insert into public.movimiento (
    id_usuario,
    id_producto,
    tipo,
    cantidad_afectada,
    destino_almacen,
    id_sesion,
    motivo
  )
  values (
    v_id_usuario,
    p_id_producto,
    'INGRESO_COMPLETO',
    v_total_unidades,
    p_id_almacen,
    v_id_sesion,
    format('Recepción RFID Orden #%s: %s paletas + %s puchos = %s unidades (%s)',
      p_id_orden, v_total_paletas, v_total_puchos, v_total_unidades, v_estado_conciliacion)
  );

  return jsonb_build_object(
    'ok', true,
    'id_sesion', v_id_sesion,
    'estado_conciliacion', v_estado_conciliacion,
    'cantidad_esperada', v_cantidad_pedida,
    'cantidad_recibida', v_total_unidades,
    'diferencia_unidades', v_diferencia,
    'paletas_completas', v_total_paletas,
    'paquetes_puchos', v_total_puchos,
    'tags_procesados', jsonb_array_length(p_lecturas)
  );
end;
$$;

grant execute on function public.conciliar_recepcion(bigint, bigint, bigint, jsonb) to authenticated;
