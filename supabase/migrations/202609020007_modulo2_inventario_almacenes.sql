-- ==============================================================================
-- Migración: Módulo 2 - Inventario y Almacenes (Políticas RLS y Función RPC)
-- Sistema de inventario RFID - Importaciones Shalom
-- ==============================================================================

-- 1. Constraint único para id_producto e id_almacen en inventario
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'inventario_producto_almacen_unico'
  ) then
    alter table public.inventario
      add constraint inventario_producto_almacen_unico unique (id_producto, id_almacen);
  end if;
end $$;

-- 2. Habilitar RLS en tablas del Módulo 2
alter table public.almacen enable row level security;
alter table public.inventario enable row level security;
alter table public.movimiento enable row level security;

-- 3. Políticas RLS
drop policy if exists "almacen_lectura" on public.almacen;
create policy "almacen_lectura" on public.almacen
  for select to authenticated using (true);

drop policy if exists "almacen_gestion" on public.almacen;
create policy "almacen_gestion" on public.almacen
  for all to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR']))
  with check (public.tiene_rol(array['ADMINISTRADOR']));

drop policy if exists "inventario_lectura" on public.inventario;
create policy "inventario_lectura" on public.inventario
  for select to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'COMPRADOR', 'OPERARIO', 'AUDITOR']));

drop policy if exists "inventario_gestion" on public.inventario;
create policy "inventario_gestion" on public.inventario
  for all to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'OPERARIO']))
  with check (public.tiene_rol(array['ADMINISTRADOR', 'OPERARIO']));

drop policy if exists "movimiento_lectura" on public.movimiento;
create policy "movimiento_lectura" on public.movimiento
  for select to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'OPERARIO', 'AUDITOR']));

drop policy if exists "movimiento_insertar" on public.movimiento;
create policy "movimiento_insertar" on public.movimiento
  for insert to authenticated
  with check (public.tiene_rol(array['ADMINISTRADOR', 'OPERARIO']));

-- 4. Función Transaccional para Ingreso/Ajuste de Stock por Paletas y Puchos
create or replace function public.ajustar_inventario_paletas(
  p_id_producto bigint,
  p_id_almacen bigint,
  p_paletas integer,
  p_puchos integer,
  p_motivo text default 'Ajuste manual de inventario'
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_unidades_por_caja integer;
  v_cajas_por_paleta integer;
  v_total_cajas integer;
  v_total_unidades numeric;
  v_id_usuario bigint;
  v_stock_anterior numeric := 0;
begin
  -- Validar permisos
  if not (public.tiene_rol(array['ADMINISTRADOR', 'OPERARIO'])) then
    raise exception 'Acceso denegado: rol no autorizado para ajustar inventario.';
  end if;

  -- Obtener la regla de empaque del producto
  select
    coalesce(r.unidades_por_caja, 1),
    (coalesce(r.cajas_por_camada, r.cajas_por_camita, 1) * coalesce(r.numero_camadas, r.camitas_por_paleta, 1))
  into v_unidades_por_caja, v_cajas_por_paleta
  from public.producto p
  left join public.regla_empaque r on r.id_producto = p.id_producto
  where p.id_producto = p_id_producto;

  if not found then
    raise exception 'Producto con ID % no encontrado.', p_id_producto;
  end if;

  v_unidades_por_caja := coalesce(v_unidades_por_caja, 1);
  v_cajas_por_paleta := coalesce(v_cajas_por_paleta, 1);

  -- Calcular cajas y unidades totales
  v_total_cajas := (greatest(0, p_paletas) * v_cajas_por_paleta) + greatest(0, p_puchos);
  v_total_unidades := v_total_cajas * v_unidades_por_caja;

  -- Identificar usuario
  select id_usuario into v_id_usuario
  from public.usuario
  where auth_user_id = auth.uid();

  -- Obtener stock anterior
  select stock_real into v_stock_anterior
  from public.inventario
  where id_producto = p_id_producto and id_almacen = p_id_almacen;

  v_stock_anterior := coalesce(v_stock_anterior, 0);

  -- Actualizar o insertar inventario
  insert into public.inventario (
    id_producto, id_almacen, stock_real, stock_minimo, estado_semaforo
  )
  values (
    p_id_producto,
    p_id_almacen,
    v_total_unidades,
    (v_cajas_por_paleta * v_unidades_por_caja),
    case
      when v_total_unidades <= 0 then 'ROJO'
      when v_total_unidades <= (v_cajas_por_paleta * v_unidades_por_caja) then 'AMARILLO'
      else 'VERDE'
    end
  )
  on conflict (id_producto, id_almacen) do update set
    stock_real = excluded.stock_real,
    estado_semaforo = case
      when excluded.stock_real <= 0 then 'ROJO'
      when excluded.stock_real <= public.inventario.stock_minimo then 'AMARILLO'
      else 'VERDE'
    end;

  -- Registrar movimiento inmutable
  insert into public.movimiento (
    id_usuario,
    id_producto,
    tipo,
    cantidad_afectada,
    destino_almacen,
    motivo
  )
  values (
    v_id_usuario,
    p_id_producto,
    'AJUSTE',
    v_total_unidades,
    p_id_almacen,
    format('%s: %s paletas (%s cajas) + %s puchos = %s unidades (anterior: %s)',
      p_motivo, p_paletas, (p_paletas * v_cajas_por_paleta), p_puchos, v_total_unidades, v_stock_anterior)
  );

  return jsonb_build_object(
    'ok', true,
    'id_producto', p_id_producto,
    'id_almacen', p_id_almacen,
    'paletas', p_paletas,
    'puchos', p_puchos,
    'total_cajas', v_total_cajas,
    'total_unidades', v_total_unidades,
    'stock_anterior', v_stock_anterior
  );
end;
$$;

grant execute on function public.ajustar_inventario_paletas(bigint, bigint, integer, integer, text) to authenticated;
