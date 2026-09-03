-- ==============================================================================
-- Migración 0010: Blindaje Integral de Recepción RFID, Idempotencia y Reglas
-- Sistema de Inventario RFID - Importaciones Shalom
-- ==============================================================================

-- 1. Columna para Idempotencia de Transacciones Offline en sesion_recepcion
alter table public.sesion_recepcion
  add column if not exists id_transaccion_offline text unique;

-- 2. Función conciliar_recepcion de Grado Industrial
create or replace function public.conciliar_recepcion(
  p_id_orden bigint,
  p_id_producto bigint,
  p_id_almacen bigint,
  p_lecturas jsonb,
  p_id_transaccion_offline text default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_id_usuario bigint;
  v_sku text;
  v_orden_estado public.orden_estado;
  v_almacen_activo boolean;
  v_cantidad_pedida integer;
  
  v_unidades_por_caja integer;
  v_cajas_por_paleta integer;
  
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
  v_prod_existente_id bigint;
  v_prod_existente_sku text;

  v_estado_conciliacion public.conciliacion_estado;
  v_diferencia numeric;
  v_sesion_previa record;
begin
  -- ---------------------------------------------------------------------------
  -- REGLA 1: VALIDACIÓN DE PERMISOS
  -- ---------------------------------------------------------------------------
  if not (public.tiene_rol(array['ADMINISTRADOR', 'OPERARIO'])) then
    raise exception 'Acceso denegado: el usuario no tiene rol de ADMINISTRADOR u OPERARIO.';
  end if;

  select id_usuario into v_id_usuario
  from public.usuario
  where auth_user_id = auth.uid();

  -- ---------------------------------------------------------------------------
  -- REGLA 2: IDEMPOTENCIA CONTRA DUPLICIDAD EN REINTENTOS OFF-LINE
  -- ---------------------------------------------------------------------------
  if p_id_transaccion_offline is not null and trim(p_id_transaccion_offline) <> '' then
    select s.id_sesion, s.estado, c.estado as conciliacion_estado, c.total_paletas_completas, c.total_paquetes_puchos
    into v_sesion_previa
    from public.sesion_recepcion s
    left join public.conciliacion_ciega c on c.id_sesion = s.id_sesion
    where s.id_transaccion_offline = trim(p_id_transaccion_offline);

    if found then
      return jsonb_build_object(
        'ok', true,
        'idempotente', true,
        'mensaje', 'Transacción previamente procesada. No se duplicó stock ni lecturas.',
        'id_sesion', v_sesion_previa.id_sesion,
        'estado_conciliacion', v_sesion_previa.conciliacion_estado,
        'paletas_completas', v_sesion_previa.total_paletas_completas,
        'paquetes_puchos', v_sesion_previa.total_paquetes_puchos
      );
    end if;
  end if;

  -- ---------------------------------------------------------------------------
  -- REGLA 3: VALIDACIONES DE NEGOCIO (ALMACÉN, ORDEN, PRODUCTO, DETALLE)
  -- ---------------------------------------------------------------------------
  -- A. Validar Almacén activo
  select activo into v_almacen_activo
  from public.almacen
  where id_almacen = p_id_almacen;

  if not found then
    raise exception 'El almacén ID % no existe.', p_id_almacen;
  elsif not v_almacen_activo then
    raise exception 'El almacén ID % se encuentra inactivo.', p_id_almacen;
  end if;

  -- B. Validar Producto activo
  select sku into v_sku
  from public.producto
  where id_producto = p_id_producto and activo = true;

  if not found then
    raise exception 'El producto ID % no existe o está inactivo.', p_id_producto;
  end if;

  -- C. Validar Orden de Importación en estado válido
  select estado into v_orden_estado
  from public.orden_importacion
  where id_orden = p_id_orden;

  if not found then
    raise exception 'La orden de importación ID % no existe.', p_id_orden;
  elsif v_orden_estado in ('RECIBIDA', 'CANCELADA') then
    raise exception 'La orden ID % no puede recibir mercancía (estado actual: %).', p_id_orden, v_orden_estado;
  end if;

  -- D. Validar que el producto pertenezca a la orden
  select cantidad_pedida into v_cantidad_pedida
  from public.detalle_orden
  where id_orden = p_id_orden and id_producto = p_id_producto;

  if not found then
    raise exception 'El producto [%] (ID %) no forma parte de la orden ID %.', v_sku, p_id_producto, p_id_orden;
  elsif v_cantidad_pedida <= 0 then
    raise exception 'La orden ID % tiene una cantidad pedida inválida (% unid).', p_id_orden, v_cantidad_pedida;
  end if;

  -- ---------------------------------------------------------------------------
  -- REGLA 4: FÓRMULA DE CAJAS POR PALETA CON PRIORIDAD ESTRICTA
  -- ---------------------------------------------------------------------------
  select
    coalesce(r.unidades_por_caja, 0),
    case
      -- 1. Prioridad: Campos estándar de estiba
      when coalesce(r.cajas_por_camada, 0) > 0 and coalesce(r.numero_camadas, 0) > 0
        then (r.cajas_por_camada * r.numero_camadas)
      -- 2. Prioridad: Campos alternativos detallados (camitas)
      when coalesce(r.cajas_por_camita, 0) > 0 and coalesce(r.camitas_por_paleta, 0) > 0
        then (r.cajas_por_camita * r.camitas_por_paleta)
      else 0
    end
  into v_unidades_por_caja, v_cajas_por_paleta
  from public.regla_empaque r
  where r.id_producto = p_id_producto;

  if not found or v_unidades_por_caja <= 0 or v_cajas_por_paleta <= 0 then
    raise exception 'El producto [%] no posee una regla de empaque válida (cajas_por_paleta > 0 y unidades_por_caja > 0).', v_sku;
  end if;

  -- ---------------------------------------------------------------------------
  -- REGLA 5: VALIDACIÓN DEL LOTE JSON, UIDS DUPLICADOS Y TIPOS DE CARGA
  -- ---------------------------------------------------------------------------
  if p_lecturas is null or jsonb_typeof(p_lecturas) <> 'array' or jsonb_array_length(p_lecturas) = 0 then
    raise exception 'El lote de lecturas RFID debe ser un arreglo JSON con al menos un elemento.';
  end if;

  -- A. Verificar UIDs duplicados dentro del mismo paquete de escaneo
  if exists (
    select trim(item->>'uid')
    from jsonb_array_elements(p_lecturas) item
    group by trim(item->>'uid')
    having count(*) > 1
  ) then
    raise exception 'Lote inválido: se detectaron etiquetas UID duplicadas dentro de la misma sesión.';
  end if;

  -- B. Verificar tipos permitidos y puchos > 0
  for v_item in select * from jsonb_array_elements(p_lecturas)
  loop
    v_uid := trim(coalesce(v_item->>'uid', ''));
    v_tipo := upper(trim(coalesce(v_item->>'tipo', '')));
    v_paquetes := coalesce((v_item->>'cantidad_paquetes')::integer, 0);

    if v_uid = '' then
      raise exception 'Lectura inválida: se encontró un tag sin UID.';
    end if;

    if v_tipo not in ('COMPLETO', 'PUCHO') then
      raise exception 'Tipo de paleta inválido "%" en tag UID %. Solo se admite "COMPLETO" o "PUCHO".', v_tipo, v_uid;
    end if;

    if v_tipo = 'PUCHO' and v_paquetes <= 0 then
      raise exception 'Tag de pucho UID % debe especificar una cantidad de paquetes mayor a 0.', v_uid;
    end if;

    -- -------------------------------------------------------------------------
    -- REGLA 6: PROTECCIÓN CONTRA REASIGNACIÓN ACCIDENTAL DE TAGS A OTRO PRODUCTO
    -- -------------------------------------------------------------------------
    select e.id_producto, p.sku
    into v_prod_existente_id, v_prod_existente_sku
    from public.etiqueta_rfid e
    join public.producto p on p.id_producto = e.id_producto
    where e.uid_tag = v_uid;

    if found and v_prod_existente_id <> p_id_producto then
      raise exception 'Seguridad RFID: El tag UID "%" ya está asignado al producto [%] y no puede reasignarse a [%].',
        v_uid, v_prod_existente_sku, v_sku;
    end if;

    -- Acumular conteos
    if v_tipo = 'COMPLETO' then
      v_total_paletas := v_total_paletas + 1;
    else
      v_total_puchos := v_total_puchos + v_paquetes;
    end if;
  end loop;

  v_total_cajas := (v_total_paletas * v_cajas_por_paleta) + v_total_puchos;
  v_total_unidades := v_total_cajas * v_unidades_por_caja;

  -- ---------------------------------------------------------------------------
  -- REGLA 7: REGISTRO DE SESIÓN CON IDEMPOTENCIA
  -- ---------------------------------------------------------------------------
  insert into public.sesion_recepcion (
    id_orden,
    id_producto,
    id_almacen,
    id_usuario,
    estado,
    total_paletas_completas,
    total_paquetes_puchos,
    id_transaccion_offline,
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
    nullif(trim(p_id_transaccion_offline), ''),
    now(),
    now()
  )
  returning id_sesion into v_id_sesion;

  -- ---------------------------------------------------------------------------
  -- REGLA 8: INSERCIÓN DE DETALLE Y ACTUALIZACIÓN DE ETIQUETAS RFID
  -- ---------------------------------------------------------------------------
  for v_item in select * from jsonb_array_elements(p_lecturas)
  loop
    v_uid := trim(v_item->>'uid');
    v_tipo := upper(trim(v_item->>'tipo'));
    v_paquetes := coalesce((v_item->>'cantidad_paquetes')::integer, 0);

    if v_tipo = 'COMPLETO' then
      v_cajas_item := v_cajas_por_paleta;
      v_unidades_item := v_cajas_por_paleta * v_unidades_por_caja;
    else
      v_cajas_item := v_paquetes;
      v_unidades_item := v_paquetes * v_unidades_por_caja;
    end if;

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
      tipo_paleta = excluded.tipo_paleta,
      cantidad_paquetes = excluded.cantidad_paquetes,
      cantidad_actual = excluded.cantidad_actual,
      estado = 'ACTIVA',
      id_almacen_actual = excluded.id_almacen_actual
    returning id_etiqueta into v_id_etiqueta;

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

  -- ---------------------------------------------------------------------------
  -- REGLA 9: CONCILIACIÓN CIEGA
  -- ---------------------------------------------------------------------------
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

  -- ---------------------------------------------------------------------------
  -- REGLA 10: ACTUALIZACIÓN DE INVENTARIO Y MOVIMIENTO ATÓMICOS
  -- ---------------------------------------------------------------------------
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
    format('Recepción RFID Orden #%s [%s]: %s paletas + %s puchos = %s unidades (%s)',
      p_id_orden, v_sku, v_total_paletas, v_total_puchos, v_total_unidades, v_estado_conciliacion)
  );

  return jsonb_build_object(
    'ok', true,
    'idempotente', false,
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

grant execute on function public.conciliar_recepcion(bigint, bigint, bigint, jsonb, text) to authenticated;
