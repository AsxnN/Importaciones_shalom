-- ==============================================================================
-- Migración: Políticas RLS para OPERARIO, Función de Conciliación y Seed Data
-- Sistema de inventario RFID - Importaciones Shalom
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. POLÍTICAS RLS ESPECÍFICAS PARA EL ROL OPERARIO (Y ADMINISTRADOR/AUDITOR)
-- ------------------------------------------------------------------------------

-- A. producto (Lectura para OPERARIO)
drop policy if exists "producto_lectura" on public.producto;
create policy "producto_lectura" on public.producto
  for select to authenticated using (true);

-- B. regla_empaque (Lectura para OPERARIO)
drop policy if exists "regla_empaque_lectura" on public.regla_empaque;
create policy "regla_empaque_lectura" on public.regla_empaque
  for select to authenticated using (true);

-- C. almacen (Lectura para OPERARIO)
drop policy if exists "almacen_lectura" on public.almacen;
create policy "almacen_lectura" on public.almacen
  for select to authenticated using (true);

-- D. orden_importacion (Lectura para OPERARIO)
alter table public.orden_importacion enable row level security;

drop policy if exists "orden_importacion_lectura" on public.orden_importacion;
create policy "orden_importacion_lectura" on public.orden_importacion
  for select to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'COMPRADOR', 'OPERARIO', 'AUDITOR']));

drop policy if exists "orden_importacion_gestion" on public.orden_importacion;
create policy "orden_importacion_gestion" on public.orden_importacion
  for all to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'COMPRADOR']))
  with check (public.tiene_rol(array['ADMINISTRADOR', 'COMPRADOR']));

-- E. detalle_orden (Lectura para OPERARIO)
alter table public.detalle_orden enable row level security;

drop policy if exists "detalle_orden_lectura" on public.detalle_orden;
create policy "detalle_orden_lectura" on public.detalle_orden
  for select to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'COMPRADOR', 'OPERARIO', 'AUDITOR']));

drop policy if exists "detalle_orden_gestion" on public.detalle_orden;
create policy "detalle_orden_gestion" on public.detalle_orden
  for all to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'COMPRADOR']))
  with check (public.tiene_rol(array['ADMINISTRADOR', 'COMPRADOR']));

-- F. sesion_recepcion (Lectura, Inserción y Actualización para OPERARIO)
alter table public.sesion_recepcion enable row level security;

drop policy if exists "sesion_recepcion_lectura" on public.sesion_recepcion;
create policy "sesion_recepcion_lectura" on public.sesion_recepcion
  for select to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'OPERARIO', 'AUDITOR']));

drop policy if exists "sesion_recepcion_insertar" on public.sesion_recepcion;
create policy "sesion_recepcion_insertar" on public.sesion_recepcion
  for insert to authenticated
  with check (public.tiene_rol(array['ADMINISTRADOR', 'OPERARIO']));

drop policy if exists "sesion_recepcion_actualizar" on public.sesion_recepcion;
create policy "sesion_recepcion_actualizar" on public.sesion_recepcion
  for update to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'OPERARIO']))
  with check (public.tiene_rol(array['ADMINISTRADOR', 'OPERARIO']));

-- G. recepcion_lectura (Lectura e Inserción para OPERARIO)
alter table public.recepcion_lectura enable row level security;

drop policy if exists "recepcion_lectura_lectura" on public.recepcion_lectura;
create policy "recepcion_lectura_lectura" on public.recepcion_lectura
  for select to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'OPERARIO', 'AUDITOR']));

drop policy if exists "recepcion_lectura_insertar" on public.recepcion_lectura;
create policy "recepcion_lectura_insertar" on public.recepcion_lectura
  for insert to authenticated
  with check (public.tiene_rol(array['ADMINISTRADOR', 'OPERARIO']));

-- H. etiqueta_rfid (Lectura, Enrolamiento y Actualización para OPERARIO)
alter table public.etiqueta_rfid enable row level security;

drop policy if exists "etiqueta_rfid_lectura" on public.etiqueta_rfid;
create policy "etiqueta_rfid_lectura" on public.etiqueta_rfid
  for select to authenticated using (true);

drop policy if exists "etiqueta_rfid_insertar" on public.etiqueta_rfid;
create policy "etiqueta_rfid_insertar" on public.etiqueta_rfid
  for insert to authenticated
  with check (public.tiene_rol(array['ADMINISTRADOR', 'OPERARIO']));

drop policy if exists "etiqueta_rfid_actualizar" on public.etiqueta_rfid;
create policy "etiqueta_rfid_actualizar" on public.etiqueta_rfid
  for update to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'OPERARIO']))
  with check (public.tiene_rol(array['ADMINISTRADOR', 'OPERARIO']));

-- I. conciliacion_ciega (Lectura e Inserción para OPERARIO)
alter table public.conciliacion_ciega enable row level security;

drop policy if exists "conciliacion_ciega_lectura" on public.conciliacion_ciega;
create policy "conciliacion_ciega_lectura" on public.conciliacion_ciega
  for select to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'OPERARIO', 'AUDITOR']));

drop policy if exists "conciliacion_ciega_gestion" on public.conciliacion_ciega;
create policy "conciliacion_ciega_gestion" on public.conciliacion_ciega
  for all to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'OPERARIO']))
  with check (public.tiene_rol(array['ADMINISTRADOR', 'OPERARIO']));

-- J. movimiento (Lectura e Inserción para OPERARIO)
alter table public.movimiento enable row level security;

drop policy if exists "movimiento_lectura" on public.movimiento;
create policy "movimiento_lectura" on public.movimiento
  for select to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'OPERARIO', 'AUDITOR']));

drop policy if exists "movimiento_insertar" on public.movimiento;
create policy "movimiento_insertar" on public.movimiento
  for insert to authenticated
  with check (public.tiene_rol(array['ADMINISTRADOR', 'OPERARIO']));


-- ------------------------------------------------------------------------------
-- 2. FUNCIÓN DE CONCILIACIÓN CIEGA (POBLAR CONCILIACION_CIEGA SEGÚN LECTURAS)
-- ------------------------------------------------------------------------------
create or replace function public.poblar_conciliacion_ciega(p_id_sesion bigint)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_id_orden bigint;
  v_id_producto bigint;
  v_cantidad_pedida integer := 0;
  v_unidades_por_caja integer := 1;
  v_cajas_por_paleta integer := 1;
  
  v_tags_leidos integer := 0;
  v_paletas_completas integer := 0;
  v_paquetes_puchos integer := 0;
  v_total_unidades_recibidas numeric := 0;
  v_diferencia numeric := 0;
  v_estado_conciliacion public.conciliacion_estado;
  v_tags_esperados integer := 0;
begin
  -- 1. Obtener la sesión
  select id_orden, id_producto
  into v_id_orden, v_id_producto
  from public.sesion_recepcion
  where id_sesion = p_id_sesion;

  if not found then
    raise exception 'Sesión de recepción ID % no existe.', p_id_sesion;
  end if;

  -- 2. Obtener regla de empaque
  select
    coalesce(r.unidades_por_caja, 1),
    (coalesce(r.cajas_por_camada, r.cajas_por_camita, 1) * coalesce(r.numero_camadas, r.camitas_por_paleta, 1))
  into v_unidades_por_caja, v_cajas_por_paleta
  from public.producto p
  left join public.regla_empaque r on r.id_producto = p.id_producto
  where p.id_producto = v_id_producto;

  v_unidades_por_caja := coalesce(v_unidades_por_caja, 1);
  v_cajas_por_paleta := coalesce(v_cajas_por_paleta, 1);

  -- 3. Obtener cantidad pedida en la orden de importación
  select coalesce(cantidad_pedida, 0)
  into v_cantidad_pedida
  from public.detalle_orden
  where id_orden = v_id_orden and id_producto = v_id_producto;

  -- 4. Sumar lecturas acumuladas en recepcion_lectura
  select
    count(*),
    count(*) filter (where tipo_carga = 'COMPLETO'),
    coalesce(sum(cantidad_paquetes) filter (where tipo_carga = 'PUCHO'), 0),
    coalesce(sum(cantidad_unidades), 0)
  into
    v_tags_leidos,
    v_paletas_completas,
    v_paquetes_puchos,
    v_total_unidades_recibidas
  from public.recepcion_lectura
  where id_sesion = p_id_sesion and valido = true;

  -- 5. Calcular diferencia y estado de conciliación
  v_diferencia := v_total_unidades_recibidas - v_cantidad_pedida;

  if v_diferencia = 0 then
    v_estado_conciliacion := 'COMPLETA';
  elsif v_diferencia < 0 then
    v_estado_conciliacion := 'FALTANTES';
  else
    v_estado_conciliacion := 'SOBRANTES';
  end if;

  if (v_cajas_por_paleta * v_unidades_por_caja) > 0 then
    v_tags_esperados := ceil(v_cantidad_pedida::numeric / (v_cajas_por_paleta * v_unidades_por_caja))::integer;
  else
    v_tags_esperados := 0;
  end if;

  -- 6. Insertar o actualizar conciliación ciega
  insert into public.conciliacion_ciega (
    id_sesion,
    tags_esperados,
    tags_leidos,
    total_paletas_completas,
    total_paquetes_puchos,
    estado
  )
  values (
    p_id_sesion,
    v_tags_esperados,
    v_tags_leidos,
    v_paletas_completas,
    v_paquetes_puchos,
    v_estado_conciliacion
  )
  on conflict (id_sesion) do update set
    tags_esperados = excluded.tags_esperados,
    tags_leidos = excluded.tags_leidos,
    total_paletas_completas = excluded.total_paletas_completas,
    total_paquetes_puchos = excluded.total_paquetes_puchos,
    estado = excluded.estado,
    fecha_cruce = now();

  -- 7. Actualizar totales en sesion_recepcion
  update public.sesion_recepcion
  set
    total_paletas_completas = v_paletas_completas,
    total_paquetes_puchos = v_paquetes_puchos,
    fecha_ultima_actividad = now()
  where id_sesion = p_id_sesion;

  return jsonb_build_object(
    'ok', true,
    'id_sesion', p_id_sesion,
    'id_orden', v_id_orden,
    'id_producto', v_id_producto,
    'cantidad_esperada', v_cantidad_pedida,
    'cantidad_recibida', v_total_unidades_recibidas,
    'diferencia', v_diferencia,
    'estado_conciliacion', v_estado_conciliacion,
    'tags_esperados', v_tags_esperados,
    'tags_leidos', v_tags_leidos,
    'paletas_completas', v_paletas_completas,
    'paquetes_puchos', v_paquetes_puchos
  );
end;
$$;

grant execute on function public.poblar_conciliacion_ciega(bigint) to authenticated;


-- ------------------------------------------------------------------------------
-- 3. DATOS MAESTROS MÍNIMOS (SEED DATA REALISTA PARA PRUEBAS END-TO-END)
-- ------------------------------------------------------------------------------

-- A. Proveedor Internacional
insert into public.proveedor (id_proveedor, razon_social, calificacion_otif, tiempo_lead_time_dias, activo)
overriding system value
values (1, 'Zhejiang Shalom Trading Co., Ltd.', 96.5, 35, true)
on conflict (razon_social) do update set
  calificacion_otif = 96.5,
  tiempo_lead_time_dias = 35,
  activo = true;

-- B. Producto Maestro con Especificaciones del SRS (Ejemplo ROLLO CONTOMETRO)
insert into public.producto (
  id_producto, id_categoria, sku, nombre, descripcion,
  unidad_medida, peso_unitario_kg, clasificacion_abc, costo_unitario, activo
)
overriding system value
values (
  1, 1, 'ROLLO-CONTOMETRO-01', 'Rollo Contómetro Térmico 80x80',
  'Rollo de papel térmico para POS y emisión de comprobantes de venta',
  'ROLLO', 0.250, 'A', 2.50, true
)
on conflict (sku) do update set
  nombre = excluded.nombre,
  descripcion = excluded.descripcion,
  unidad_medida = excluded.unidad_medida,
  peso_unitario_kg = excluded.peso_unitario_kg,
  costo_unitario = excluded.costo_unitario,
  clasificacion_abc = excluded.clasificacion_abc,
  activo = true;

-- C. Regla de Empaque:
-- 10 unidades por caja
-- 6 cajas/fila * 5 filas/camada = 30 cajas/camada
-- 1 camada/paleta = 30 cajas/paleta (300 unidades/paleta)
insert into public.regla_empaque (
  id_empaque, id_producto, unidades_por_caja, cajas_por_camada, numero_camadas,
  cajas_por_camita, camitas_por_paleta, permite_puchos, notas_armado,
  largo_caja_cm, ancho_caja_cm, alto_caja_cm, peso_caja_kg,
  volumen_caja_m3, volumen_total_m3
)
overriding system value
values (
  1, 1, 10, 30, 1, 30, 1, true, 'Estiba trabada estándar sobre parihuela de 1.20 x 1.00 m',
  40.0, 30.0, 25.0, 7.500, 0.0300, 0.9000
)
on conflict (id_producto) do update set
  unidades_por_caja = 10,
  cajas_por_camada = 30,
  numero_camadas = 1,
  cajas_por_camita = 30,
  camitas_por_paleta = 1,
  permite_puchos = true,
  volumen_caja_m3 = 0.0300,
  volumen_total_m3 = 0.9000;

-- D. Orden de Importación en Estado 'TRANSITO' (Lista para ser recibida por el ESP32)
insert into public.orden_importacion (
  id_orden, numero_orden, id_proveedor, estado, fecha_emision,
  tipo_contenedor, volumen_ocupado_m3
)
overriding system value
values (
  1, 'ORD-2026-001', 1, 'TRANSITO', current_date, '40FT', 58.5
)
on conflict (numero_orden) do update set
  estado = 'TRANSITO',
  tipo_contenedor = '40FT';

-- E. Detalle de la Orden:
-- Pedido exacto: 980 unidades
-- (Cálculo SRS: 3 paletas completas de 300 unid = 900 unid + 8 cajas pucho de 10 unid = 80 unid)
insert into public.detalle_orden (
  id_detalle, id_orden, id_producto, cantidad_pedida, subtotal_peso_kg, subtotal_volumen_m3
)
overriding system value
values (
  1, 1, 1, 980, 735.0, 2.94
)
on conflict (id_detalle) do update set
  cantidad_pedida = 980,
  subtotal_peso_kg = 735.0,
  subtotal_volumen_m3 = 2.94;

-- F. Inicialización del Producto en Inventario de Almacén Principal (Stock 0 inicial)
insert into public.inventario (id_producto, id_almacen, stock_real, stock_minimo, estado_semaforo)
values (1, 1, 0, 300, 'ROJO')
on conflict (id_producto, id_almacen) do nothing;
