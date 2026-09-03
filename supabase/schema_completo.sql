-- ==============================================================================
-- SCHEMA MAESTRO COMPLETO — SISTEMA TÁCTICO DE INVENTARIOS RFID SHALOM
-- Base de Datos PostgreSQL 17 / Supabase
-- Proyecto: Importaciones Shalom (pzsxzzfrwpamjkyyjodj)
-- ARCHIVO DE CONTROL ÚNICO: Contiene la definición viva de toda la BD
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. TIPOS ENUMERADOS (ENUMS)
-- ------------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'rol_nombre') then
    create type public.rol_nombre as enum ('ADMINISTRADOR', 'COMPRADOR', 'OPERARIO', 'AUDITOR');
  end if;
  if not exists (select 1 from pg_type where typname = 'permiso_accion') then
    create type public.permiso_accion as enum ('VER', 'CREAR', 'EDITAR', 'ELIMINAR');
  end if;
  if not exists (select 1 from pg_type where typname = 'almacen_tipo') then
    create type public.almacen_tipo as enum ('PRINCIPAL', 'TIENDA', 'MERMA');
  end if;
  if not exists (select 1 from pg_type where typname = 'orden_estado') then
    create type public.orden_estado as enum ('BORRADOR', 'TRANSITO', 'RECIBIDA');
  end if;
  if not exists (select 1 from pg_type where typname = 'contenedor_tipo') then
    create type public.contenedor_tipo as enum ('20FT', '40FT', 'LCL');
  end if;
  if not exists (select 1 from pg_type where typname = 'red_estado') then
    create type public.red_estado as enum ('ONLINE', 'OFFLINE');
  end if;
  if not exists (select 1 from pg_type where typname = 'tipo_paleta') then
    create type public.tipo_paleta as enum ('COMPLETO', 'PUCHO');
  end if;
  if not exists (select 1 from pg_type where typname = 'etiqueta_estado') then
    create type public.etiqueta_estado as enum ('ACTIVA', 'VACIA', 'EXTRAVIADA');
  end if;
  if not exists (select 1 from pg_type where typname = 'sesion_estado') then
    create type public.sesion_estado as enum ('ACTIVA', 'PAUSADA', 'FINALIZADA');
  end if;
  if not exists (select 1 from pg_type where typname = 'movimiento_tipo') then
    create type public.movimiento_tipo as enum ('INGRESO_COMPLETO', 'INGRESO_PUCHO', 'DESPACHO_COMPLETO', 'RETIRO_PARCIAL', 'AJUSTE');
  end if;
  if not exists (select 1 from pg_type where typname = 'conciliacion_estado') then
    create type public.conciliacion_estado as enum ('COMPLETA', 'FALTANTES', 'SOBRANTES');
  end if;
end $$;

-- ------------------------------------------------------------------------------
-- 2. SEGURIDAD Y CONTROL DE ACCESO (RBAC)
-- ------------------------------------------------------------------------------
create table if not exists public.rol (
  id_rol bigint generated always as identity primary key,
  nombre_rol public.rol_nombre not null unique,
  descripcion varchar,
  activo boolean not null default true
);

create table if not exists public.permiso (
  id_permiso bigint generated always as identity primary key,
  codigo_modulo varchar not null,
  accion public.permiso_accion not null,
  constraint permiso_modulo_accion_unico unique (codigo_modulo, accion)
);

create table if not exists public.rol_permiso (
  id_rol_permiso bigint generated always as identity primary key,
  id_rol bigint not null references public.rol(id_rol) on delete cascade,
  id_permiso bigint not null references public.permiso(id_permiso) on delete cascade,
  constraint rol_permiso_unico unique (id_rol, id_permiso)
);

create table if not exists public.usuario (
  id_usuario bigint generated always as identity primary key,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  nombre_completo varchar not null,
  codigo_operario varchar unique,
  correo varchar,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.usuario_rol (
  id_usuario_rol bigint generated always as identity primary key,
  id_usuario bigint not null references public.usuario(id_usuario) on delete cascade,
  id_rol bigint not null references public.rol(id_rol) on delete cascade,
  fecha_asignacion timestamptz not null default now(),
  asignado_por bigint references public.usuario(id_usuario),
  activo boolean not null default true,
  constraint usuario_rol_unico unique (id_usuario, id_rol)
);

-- ------------------------------------------------------------------------------
-- 3. MAESTROS: CATEGORÍA, PRODUCTO Y EMPAQUE (MÓDULO 1)
-- ------------------------------------------------------------------------------
create table if not exists public.categoria (
  id_categoria bigint generated always as identity primary key,
  nombre varchar not null unique,
  descripcion text,
  activo boolean not null default true
);

create table if not exists public.producto (
  id_producto bigint generated always as identity primary key,
  id_categoria bigint references public.categoria(id_categoria) on delete set null,
  sku varchar not null unique,
  nombre varchar not null,
  descripcion text not null,
  unidad_medida varchar(20) default 'UNIDAD',
  peso_unitario_kg numeric(10,3) check (peso_unitario_kg is null or peso_unitario_kg > 0),
  clasificacion_abc varchar(5) default 'B' check (clasificacion_abc in ('A', 'B', 'C', '')),
  costo_unitario numeric(12,2) check (costo_unitario is null or costo_unitario >= 0),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.regla_empaque (
  id_empaque bigint generated always as identity primary key,
  id_producto bigint not null unique references public.producto(id_producto) on delete cascade,
  unidades_por_caja integer not null check (unidades_por_caja > 0),
  cajas_por_camada integer check (cajas_por_camada is null or cajas_por_camada > 0),
  numero_camadas integer check (numero_camadas is null or numero_camadas > 0),
  cajas_por_camita integer check (cajas_por_camita is null or cajas_por_camita > 0),
  camitas_por_paleta integer check (camitas_por_paleta is null or camitas_por_paleta > 0),
  permite_puchos boolean not null default true,
  notas_armado text,
  imagen_armado_path text,
  largo_caja_cm numeric(10,2) check (largo_caja_cm is null or largo_caja_cm > 0),
  ancho_caja_cm numeric(10,2) check (ancho_caja_cm is null or ancho_caja_cm > 0),
  alto_caja_cm numeric(10,2) check (alto_caja_cm is null or alto_caja_cm > 0),
  peso_caja_kg numeric(10,3) check (peso_caja_kg is null or peso_caja_kg > 0),
  alto_paleta_cm numeric check (alto_paleta_cm is null or alto_paleta_cm > 0),
  peso_paleta_kg numeric check (peso_paleta_kg is null or peso_paleta_kg > 0),
  volumen_caja_m3 numeric(10,4),
  volumen_total_m3 numeric(10,4)
);

create table if not exists public.esquema_camita (
  id_esquema bigint generated always as identity primary key,
  id_producto bigint references public.producto(id_producto) on delete cascade,
  nombre varchar not null,
  cajas_por_fila integer not null check (cajas_por_fila > 0),
  filas_por_camada integer not null check (filas_por_camada > 0),
  cajas_por_camada integer generated always as (cajas_por_fila * filas_por_camada) stored,
  numero_camadas integer not null check (numero_camadas > 0),
  alto_paleta_armada_cm numeric check (alto_paleta_armada_cm > 0),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.auditoria_catalogo (
  id_auditoria bigint generated always as identity primary key,
  tabla varchar not null,
  operacion varchar not null check (operacion in ('INSERT', 'UPDATE', 'DELETE')),
  id_registro varchar not null,
  auth_user_id uuid references auth.users(id),
  datos_anteriores jsonb,
  datos_nuevos jsonb,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------------------
-- 4. ALMACENES E INVENTARIO (MÓDULO 2)
-- ------------------------------------------------------------------------------
create table if not exists public.almacen (
  id_almacen bigint generated always as identity primary key,
  nombre varchar not null unique,
  tipo public.almacen_tipo not null default 'PRINCIPAL',
  capacidad_m3 numeric check (capacidad_m3 is null or capacidad_m3 > 0),
  activo boolean not null default true
);

create table if not exists public.inventario (
  id_inventario bigint generated always as identity primary key,
  id_producto bigint not null references public.producto(id_producto) on delete cascade,
  id_almacen bigint not null references public.almacen(id_almacen) on delete cascade,
  stock_real numeric not null default 0 check (stock_real >= 0),
  stock_minimo numeric not null default 0 check (stock_minimo >= 0),
  consumo_abs numeric not null default 0,
  estado_semaforo varchar not null default 'VERDE' check (estado_semaforo in ('VERDE', 'AMARILLO', 'ROJO')),
  fecha_quiebre_estimada date,
  constraint inventario_producto_almacen_unico unique (id_producto, id_almacen)
);

-- ------------------------------------------------------------------------------
-- 5. COMPRAS E IMPORTACIONES (MÓDULO 3)
-- ------------------------------------------------------------------------------
create table if not exists public.proveedor (
  id_proveedor bigint generated always as identity primary key,
  razon_social varchar not null unique,
  calificacion_otif numeric check (calificacion_otif is null or (calificacion_otif >= 0 and calificacion_otif <= 100)),
  tiempo_lead_time_dias integer check (tiempo_lead_time_dias is null or tiempo_lead_time_dias >= 0),
  activo boolean not null default true
);

create table if not exists public.orden_importacion (
  id_orden bigint generated always as identity primary key,
  numero_orden varchar not null unique,
  id_proveedor bigint references public.proveedor(id_proveedor) on delete set null,
  estado public.orden_estado not null default 'BORRADOR',
  fecha_emision date default current_date,
  tipo_contenedor public.contenedor_tipo,
  volumen_ocupado_m3 numeric check (volumen_ocupado_m3 is null or volumen_ocupado_m3 >= 0)
);

create table if not exists public.detalle_orden (
  id_detalle bigint generated always as identity primary key,
  id_orden bigint not null references public.orden_importacion(id_orden) on delete cascade,
  id_producto bigint not null references public.producto(id_producto),
  cantidad_pedida integer not null check (cantidad_pedida > 0),
  subtotal_peso_kg numeric,
  subtotal_volumen_m3 numeric
);

-- ------------------------------------------------------------------------------
-- 6. IOT, DISPOSITIVOS Y TRAZABILIDAD RFID (MÓDULO 4 Y 5)
-- ------------------------------------------------------------------------------
create table if not exists public.dispositivo_iot (
  id_dispositivo bigint generated always as identity primary key,
  mac_address varchar not null unique,
  ip_local inet,
  nivel_bateria integer check (nivel_bateria is null or (nivel_bateria >= 0 and nivel_bateria <= 100)),
  version_firmware varchar,
  estado_red public.red_estado not null default 'OFFLINE',
  id_almacen bigint references public.almacen(id_almacen) on delete set null,
  ultimo_contacto timestamptz
);

create table if not exists public.etiqueta_rfid (
  id_etiqueta bigint generated always as identity primary key,
  uid_tag varchar not null unique,
  id_producto bigint not null references public.producto(id_producto),
  tipo_paleta public.tipo_paleta not null default 'COMPLETO',
  cantidad_paquetes integer not null default 0 check (cantidad_paquetes >= 0),
  cantidad_actual numeric not null default 0 check (cantidad_actual >= 0),
  estado public.etiqueta_estado not null default 'ACTIVA',
  fecha_enrolamiento timestamptz not null default now(),
  id_almacen_actual bigint references public.almacen(id_almacen) on delete set null
);

create table if not exists public.sesion_recepcion (
  id_sesion bigint generated always as identity primary key,
  id_orden bigint references public.orden_importacion(id_orden) on delete set null,
  id_producto bigint references public.producto(id_producto),
  id_almacen bigint references public.almacen(id_almacen),
  id_usuario bigint references public.usuario(id_usuario),
  estado public.sesion_estado not null default 'ACTIVA',
  total_paletas_completas integer not null default 0 check (total_paletas_completas >= 0),
  total_paquetes_puchos integer not null default 0 check (total_paquetes_puchos >= 0),
  id_transaccion_offline text unique,
  fecha_inicio timestamptz not null default now(),
  fecha_ultima_actividad timestamptz not null default now(),
  fecha_finalizacion timestamptz
);

create table if not exists public.movimiento (
  id_movimiento bigint generated always as identity primary key,
  id_usuario bigint references public.usuario(id_usuario) on delete set null,
  id_dispositivo bigint references public.dispositivo_iot(id_dispositivo) on delete set null,
  id_etiqueta bigint references public.etiqueta_rfid(id_etiqueta) on delete set null,
  id_producto bigint not null references public.producto(id_producto),
  tipo public.movimiento_tipo not null,
  cantidad_afectada numeric not null check (cantidad_afectada > 0),
  fecha_hora timestamptz not null default now(),
  destino_almacen bigint references public.almacen(id_almacen),
  motivo varchar,
  id_sesion bigint references public.sesion_recepcion(id_sesion) on delete set null,
  es_sincronizado_offline boolean not null default false,
  idempotency_key uuid unique
);

create table if not exists public.recepcion_lectura (
  id_lectura bigint generated always as identity primary key,
  id_sesion bigint not null references public.sesion_recepcion(id_sesion) on delete cascade,
  id_etiqueta bigint references public.etiqueta_rfid(id_etiqueta) on delete set null,
  uid_tag varchar not null,
  tipo_carga public.tipo_paleta not null,
  cantidad_paquetes integer not null default 0,
  cantidad_unidades numeric not null default 0,
  leido_en timestamptz not null default now(),
  valido boolean not null default true,
  motivo_invalidez text
);

create table if not exists public.conciliacion_ciega (
  id_conciliacion bigint generated always as identity primary key,
  id_sesion bigint not null unique references public.sesion_recepcion(id_sesion) on delete cascade,
  fecha_cruce timestamptz not null default now(),
  tags_esperados integer,
  tags_leidos integer not null default 0,
  total_paletas_completas integer not null default 0,
  total_paquetes_puchos integer not null default 0,
  estado public.conciliacion_estado not null
);

create table if not exists public.auditoria_eri (
  id_auditoria bigint generated always as identity primary key,
  id_almacen bigint not null references public.almacen(id_almacen),
  id_usuario bigint references public.usuario(id_usuario) on delete set null,
  id_dispositivo bigint references public.dispositivo_iot(id_dispositivo) on delete set null,
  fecha_auditoria timestamptz not null default now(),
  tags_esperados integer not null default 0,
  tags_leidos integer not null default 0,
  porcentaje_eri numeric check (porcentaje_eri is null or (porcentaje_eri >= 0 and porcentaje_eri <= 100)),
  observaciones text
);

-- ------------------------------------------------------------------------------
-- 7. VISTAS CONSOLIDADAS Y CÁLCULOS LOGÍSTICOS
-- ------------------------------------------------------------------------------
create or replace view public.v_productos_empaque
with (security_invoker = true)
as
select
  p.id_producto,
  p.sku,
  p.nombre,
  p.descripcion,
  p.unidad_medida,
  p.peso_unitario_kg,
  p.costo_unitario,
  p.clasificacion_abc,
  p.activo as producto_activo,
  p.created_at,
  c.id_categoria,
  c.nombre as categoria_nombre,
  c.descripcion as categoria_descripcion,
  r.id_empaque,
  r.unidades_por_caja,
  coalesce(r.cajas_por_camada, r.cajas_por_camita, 1) as cajas_por_camada,
  coalesce(r.numero_camadas, r.camitas_por_paleta, 1) as numero_camadas,
  (coalesce(r.cajas_por_camada, r.cajas_por_camita, 1) * coalesce(r.numero_camadas, r.camitas_por_paleta, 1)) as cajas_por_paleta,
  (coalesce(r.cajas_por_camada, r.cajas_por_camita, 1) * coalesce(r.numero_camadas, r.camitas_por_paleta, 1) * coalesce(r.unidades_por_caja, 1)) as unidades_por_paleta,
  r.permite_puchos,
  r.notas_armado,
  r.imagen_armado_path,
  r.largo_caja_cm,
  r.ancho_caja_cm,
  r.alto_caja_cm,
  r.peso_caja_kg,
  r.alto_paleta_cm,
  r.peso_paleta_kg,
  case
    when r.largo_caja_cm is not null and r.ancho_caja_cm is not null and r.alto_caja_cm is not null
    then round((r.largo_caja_cm * r.ancho_caja_cm * r.alto_caja_cm / 1000000.0), 4)
    else r.volumen_caja_m3
  end as volumen_caja_m3,
  case
    when r.largo_caja_cm is not null and r.ancho_caja_cm is not null and r.alto_caja_cm is not null
    then round(((r.largo_caja_cm * r.ancho_caja_cm * r.alto_caja_cm / 1000000.0) * (coalesce(r.cajas_por_camada, r.cajas_por_camita, 1) * coalesce(r.numero_camadas, r.camitas_por_paleta, 1))), 4)
    else r.volumen_total_m3
  end as volumen_paleta_m3
from public.producto p
left join public.categoria c on c.id_categoria = p.id_categoria
left join public.regla_empaque r on r.id_producto = p.id_producto;

-- ------------------------------------------------------------------------------
-- 8. FUNCIONES RPC DE SEGURIDAD Y TRANSACCIONES
-- ------------------------------------------------------------------------------
create or replace function public.es_administrador()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.usuario_rol ur
    join public.usuario u on u.id_usuario = ur.id_usuario
    join public.rol r on r.id_rol = ur.id_rol
    where u.auth_user_id = auth.uid() and u.activo and ur.activo
      and r.activo and r.nombre_rol = 'ADMINISTRADOR'
  );
$$;

create or replace function public.tiene_rol(roles_permitidos text[])
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.usuario u
    join public.usuario_rol ur on ur.id_usuario = u.id_usuario and ur.activo
    join public.rol r on r.id_rol = ur.id_rol and r.activo
    where u.auth_user_id = auth.uid() and u.activo
      and r.nombre_rol::text = any(roles_permitidos)
  );
$$;

create or replace function public.mi_perfil_acceso()
returns table (nombre_completo text, roles text[], permisos text[])
language sql stable security definer set search_path = public
as $$
  select u.nombre_completo::text,
    coalesce(array_agg(distinct r.nombre_rol::text) filter (where r.nombre_rol is not null), '{}')::text[],
    coalesce(array_agg(distinct p.codigo_modulo || '.' || p.accion::text) filter (where p.id_permiso is not null), '{}')::text[]
  from public.usuario u
  left join public.usuario_rol ur on ur.id_usuario = u.id_usuario and ur.activo
  left join public.rol r on r.id_rol = ur.id_rol and r.activo
  left join public.rol_permiso rp on rp.id_rol = r.id_rol
  left join public.permiso p on p.id_permiso = rp.id_permiso
  where u.auth_user_id = auth.uid() and u.activo
  group by u.id_usuario, u.nombre_completo;
$$;

-- Función transaccional atómica para ajustar o ingresar stock por paletas y puchos
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
  -- 1. Validar permisos: solo ADMINISTRADOR y OPERARIO pueden registrar stock
  if not (public.tiene_rol(array['ADMINISTRADOR', 'OPERARIO'])) then
    raise exception 'Acceso denegado: rol no autorizado para ajustar inventario.';
  end if;

  -- 2. Obtener la regla de empaque del producto
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

  -- 3. Calcular cajas y unidades totales
  v_total_cajas := (greatest(0, p_paletas) * v_cajas_por_paleta) + greatest(0, p_puchos);
  v_total_unidades := v_total_cajas * v_unidades_por_caja;

  -- 4. Obtener usuario actual
  select id_usuario into v_id_usuario
  from public.usuario
  where auth_user_id = auth.uid();

  -- 5. Obtener stock anterior si existe
  select stock_real into v_stock_anterior
  from public.inventario
  where id_producto = p_id_producto and id_almacen = p_id_almacen;

  v_stock_anterior := coalesce(v_stock_anterior, 0);

  -- 6. Upsert en tabla inventario
  insert into public.inventario (
    id_producto, id_almacen, stock_real, stock_minimo, estado_semaforo
  )
  values (
    p_id_producto,
    p_id_almacen,
    v_total_unidades,
    (v_cajas_por_paleta * v_unidades_por_caja), -- Stock mínimo sugerido: 1 paleta
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

  -- 7. Registrar en tabla movimiento para trazabilidad inalterable
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

-- Función conciliar_recepcion de Grado Industrial con Idempotencia y Blindaje RFID
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
  if not (public.tiene_rol(array['ADMINISTRADOR', 'OPERARIO'])) then
    raise exception 'Acceso denegado: el usuario no tiene rol de ADMINISTRADOR u OPERARIO.';
  end if;

  select id_usuario into v_id_usuario
  from public.usuario
  where auth_user_id = auth.uid();

  -- Idempotencia para sincronizaciones offline o reintentos
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

  -- Validar Almacén activo
  select activo into v_almacen_activo
  from public.almacen
  where id_almacen = p_id_almacen;

  if not found then
    raise exception 'El almacén ID % no existe.', p_id_almacen;
  elsif not v_almacen_activo then
    raise exception 'El almacén ID % se encuentra inactivo.', p_id_almacen;
  end if;

  -- Validar Producto activo
  select sku into v_sku
  from public.producto
  where id_producto = p_id_producto and activo = true;

  if not found then
    raise exception 'El producto ID % no existe o está inactivo.', p_id_producto;
  end if;

  -- Validar Orden de Importación
  select estado into v_orden_estado
  from public.orden_importacion
  where id_orden = p_id_orden;

  if not found then
    raise exception 'La orden de importación ID % no existe.', p_id_orden;
  elsif v_orden_estado in ('RECIBIDA', 'CANCELADA') then
    raise exception 'La orden ID % no puede recibir mercancía (estado actual: %).', p_id_orden, v_orden_estado;
  end if;

  -- Validar Detalle de Orden
  select cantidad_pedida into v_cantidad_pedida
  from public.detalle_orden
  where id_orden = p_id_orden and id_producto = p_id_producto;

  if not found then
    raise exception 'El producto [%] (ID %) no forma parte de la orden ID %.', v_sku, p_id_producto, p_id_orden;
  elsif v_cantidad_pedida <= 0 then
    raise exception 'La orden ID % tiene una cantidad pedida inválida (% unid).', p_id_orden, v_cantidad_pedida;
  end if;

  -- Fórmula de empaque con prioridad estricta
  select
    coalesce(r.unidades_por_caja, 0),
    case
      when coalesce(r.cajas_por_camada, 0) > 0 and coalesce(r.numero_camadas, 0) > 0
        then (r.cajas_por_camada * r.numero_camadas)
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

  -- Validar lote JSON
  if p_lecturas is null or jsonb_typeof(p_lecturas) <> 'array' or jsonb_array_length(p_lecturas) = 0 then
    raise exception 'El lote de lecturas RFID debe ser un arreglo JSON con al menos un elemento.';
  end if;

  if exists (
    select trim(item->>'uid')
    from jsonb_array_elements(p_lecturas) item
    group by trim(item->>'uid')
    having count(*) > 1
  ) then
    raise exception 'Lote inválido: se detectaron etiquetas UID duplicadas dentro de la misma sesión.';
  end if;

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

    select e.id_producto, p.sku
    into v_prod_existente_id, v_prod_existente_sku
    from public.etiqueta_rfid e
    join public.producto p on p.id_producto = e.id_producto
    where e.uid_tag = v_uid;

    if found and v_prod_existente_id <> p_id_producto then
      raise exception 'Seguridad RFID: El tag UID "%" ya está asignado al producto [%] y no puede reasignarse a [%].',
        v_uid, v_prod_existente_sku, v_sku;
    end if;

    if v_tipo = 'COMPLETO' then
      v_total_paletas := v_total_paletas + 1;
    else
      v_total_puchos := v_total_puchos + v_paquetes;
    end if;
  end loop;

  v_total_cajas := (v_total_paletas * v_cajas_por_paleta) + v_total_puchos;
  v_total_unidades := v_total_cajas * v_unidades_por_caja;

  insert into public.sesion_recepcion (
    id_orden, id_producto, id_almacen, id_usuario, estado,
    total_paletas_completas, total_paquetes_puchos, id_transaccion_offline,
    fecha_inicio, fecha_finalizacion
  )
  values (
    p_id_orden, p_id_producto, p_id_almacen, v_id_usuario, 'FINALIZADA',
    v_total_paletas, v_total_puchos, nullif(trim(p_id_transaccion_offline), ''),
    now(), now()
  )
  returning id_sesion into v_id_sesion;

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
      uid_tag, id_producto, tipo_paleta, cantidad_paquetes,
      cantidad_actual, estado, id_almacen_actual
    )
    values (
      v_uid, p_id_producto, v_tipo::public.tipo_paleta,
      v_cajas_item, v_unidades_item, 'ACTIVA', p_id_almacen
    )
    on conflict (uid_tag) do update set
      tipo_paleta = excluded.tipo_paleta,
      cantidad_paquetes = excluded.cantidad_paquetes,
      cantidad_actual = excluded.cantidad_actual,
      estado = 'ACTIVA',
      id_almacen_actual = excluded.id_almacen_actual
    returning id_etiqueta into v_id_etiqueta;

    insert into public.recepcion_lectura (
      id_sesion, id_etiqueta, uid_tag, tipo_carga,
      cantidad_paquetes, cantidad_unidades, valido
    )
    values (
      v_id_sesion, v_id_etiqueta, v_uid, v_tipo::public.tipo_paleta,
      v_cajas_item, v_unidades_item, true
    );
  end loop;

  v_diferencia := v_total_unidades - v_cantidad_pedida;

  if v_diferencia = 0 then
    v_estado_conciliacion := 'COMPLETA';
  elsif v_diferencia < 0 then
    v_estado_conciliacion := 'FALTANTES';
  else
    v_estado_conciliacion := 'SOBRANTES';
  end if;

  insert into public.conciliacion_ciega (
    id_sesion, tags_esperados, tags_leidos,
    total_paletas_completas, total_paquetes_puchos, estado
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

  insert into public.inventario (
    id_producto, id_almacen, stock_real, stock_minimo, estado_semaforo
  )
  values (
    p_id_producto, p_id_almacen, v_total_unidades,
    (v_cajas_por_paleta * v_unidades_por_caja), 'VERDE'
  )
  on conflict (id_producto, id_almacen) do update set
    stock_real = public.inventario.stock_real + excluded.stock_real,
    estado_semaforo = case
      when (public.inventario.stock_real + excluded.stock_real) <= 0 then 'ROJO'
      when (public.inventario.stock_real + excluded.stock_real) <= public.inventario.stock_minimo then 'AMARILLO'
      else 'VERDE'
    end;

  insert into public.movimiento (
    id_usuario, id_producto, tipo, cantidad_afectada,
    destino_almacen, id_sesion, motivo
  )
  values (
    v_id_usuario, p_id_producto, 'INGRESO_COMPLETO',
    v_total_unidades, p_id_almacen, v_id_sesion,
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

-- ------------------------------------------------------------------------------
-- Función para poblar o recalcular la conciliación ciega de una sesión
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
  select id_orden, id_producto
  into v_id_orden, v_id_producto
  from public.sesion_recepcion
  where id_sesion = p_id_sesion;

  if not found then
    raise exception 'Sesión de recepción ID % no existe.', p_id_sesion;
  end if;

  select
    coalesce(r.unidades_por_caja, 1),
    (coalesce(r.cajas_por_camada, r.cajas_por_camita, 1) * coalesce(r.numero_camadas, r.camitas_por_paleta, 1))
  into v_unidades_por_caja, v_cajas_por_paleta
  from public.producto p
  left join public.regla_empaque r on r.id_producto = p.id_producto
  where p.id_producto = v_id_producto;

  v_unidades_por_caja := coalesce(v_unidades_por_caja, 1);
  v_cajas_por_paleta := coalesce(v_cajas_por_paleta, 1);

  select coalesce(cantidad_pedida, 0)
  into v_cantidad_pedida
  from public.detalle_orden
  where id_orden = v_id_orden and id_producto = v_id_producto;

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

  insert into public.conciliacion_ciega (
    id_sesion, tags_esperados, tags_leidos,
    total_paletas_completas, total_paquetes_puchos, estado
  )
  values (
    p_id_sesion, v_tags_esperados, v_tags_leidos,
    v_paletas_completas, v_paquetes_puchos, v_estado_conciliacion
  )
  on conflict (id_sesion) do update set
    tags_esperados = excluded.tags_esperados,
    tags_leidos = excluded.tags_leidos,
    total_paletas_completas = excluded.total_paletas_completas,
    total_paquetes_puchos = excluded.total_paquetes_puchos,
    estado = excluded.estado,
    fecha_cruce = now();

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

-- ------------------------------------------------------------------------------
-- 9. PERMISOS DE EJECUCIÓN
-- ------------------------------------------------------------------------------
grant execute on function public.es_administrador() to authenticated;
grant execute on function public.tiene_rol(text[]) to authenticated;
grant execute on function public.mi_perfil_acceso() to authenticated;
grant execute on function public.ajustar_inventario_paletas(bigint, bigint, integer, integer, text) to authenticated;
grant execute on function public.conciliar_recepcion(bigint, bigint, bigint, jsonb, text) to authenticated;
grant execute on function public.poblar_conciliacion_ciega(bigint) to authenticated;
grant select on public.v_productos_empaque to authenticated;

-- ------------------------------------------------------------------------------
-- 10. POLÍTICAS ROW LEVEL SECURITY (RLS) GENERALES
-- ------------------------------------------------------------------------------
alter table public.rol enable row level security;
alter table public.permiso enable row level security;
alter table public.rol_permiso enable row level security;
alter table public.usuario enable row level security;
alter table public.usuario_rol enable row level security;
alter table public.categoria enable row level security;
alter table public.producto enable row level security;
alter table public.regla_empaque enable row level security;
alter table public.esquema_camita enable row level security;
alter table public.auditoria_catalogo enable row level security;
alter table public.almacen enable row level security;
alter table public.inventario enable row level security;
alter table public.proveedor enable row level security;
alter table public.orden_importacion enable row level security;
alter table public.detalle_orden enable row level security;
alter table public.dispositivo_iot enable row level security;
alter table public.etiqueta_rfid enable row level security;
alter table public.sesion_recepcion enable row level security;
alter table public.movimiento enable row level security;
alter table public.recepcion_lectura enable row level security;
alter table public.conciliacion_ciega enable row level security;
alter table public.auditoria_eri enable row level security;

-- Políticas de Lectura Universal Autenticada para Maestros y Catálogos
drop policy if exists "rol_lectura" on public.rol;
create policy "rol_lectura" on public.rol for select to authenticated using (true);

drop policy if exists "categoria_lectura" on public.categoria;
create policy "categoria_lectura" on public.categoria for select to authenticated using (true);

drop policy if exists "producto_lectura" on public.producto;
create policy "producto_lectura" on public.producto for select to authenticated using (true);

drop policy if exists "regla_empaque_lectura" on public.regla_empaque;
create policy "regla_empaque_lectura" on public.regla_empaque for select to authenticated using (true);

drop policy if exists "esquema_camita_lectura" on public.esquema_camita;
create policy "esquema_camita_lectura" on public.esquema_camita for select to authenticated using (true);

drop policy if exists "almacen_lectura" on public.almacen;
create policy "almacen_lectura" on public.almacen for select to authenticated using (true);

drop policy if exists "inventario_lectura" on public.inventario;
create policy "inventario_lectura" on public.inventario for select to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'COMPRADOR', 'OPERARIO', 'AUDITOR']));

drop policy if exists "proveedor_lectura" on public.proveedor;
create policy "proveedor_lectura" on public.proveedor for select to authenticated using (true);

drop policy if exists "orden_importacion_lectura" on public.orden_importacion;
create policy "orden_importacion_lectura" on public.orden_importacion for select to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'COMPRADOR', 'OPERARIO', 'AUDITOR']));

drop policy if exists "detalle_orden_lectura" on public.detalle_orden;
create policy "detalle_orden_lectura" on public.detalle_orden for select to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'COMPRADOR', 'OPERARIO', 'AUDITOR']));

drop policy if exists "movimiento_lectura" on public.movimiento;
create policy "movimiento_lectura" on public.movimiento for select to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'OPERARIO', 'AUDITOR']));

drop policy if exists "etiqueta_rfid_lectura" on public.etiqueta_rfid;
create policy "etiqueta_rfid_lectura" on public.etiqueta_rfid for select to authenticated using (true);

drop policy if exists "sesion_recepcion_lectura" on public.sesion_recepcion;
create policy "sesion_recepcion_lectura" on public.sesion_recepcion for select to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'OPERARIO', 'AUDITOR']));

drop policy if exists "recepcion_lectura_lectura" on public.recepcion_lectura;
create policy "recepcion_lectura_lectura" on public.recepcion_lectura for select to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'OPERARIO', 'AUDITOR']));

drop policy if exists "conciliacion_ciega_lectura" on public.conciliacion_ciega;
create policy "conciliacion_ciega_lectura" on public.conciliacion_ciega for select to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'OPERARIO', 'AUDITOR']));

-- Políticas de Edición / Gestión
drop policy if exists "categoria_gestion" on public.categoria;
create policy "categoria_gestion" on public.categoria for all to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'COMPRADOR']))
  with check (public.tiene_rol(array['ADMINISTRADOR', 'COMPRADOR']));

drop policy if exists "producto_gestion" on public.producto;
create policy "producto_gestion" on public.producto for all to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'COMPRADOR']))
  with check (public.tiene_rol(array['ADMINISTRADOR', 'COMPRADOR']));

drop policy if exists "regla_empaque_gestion" on public.regla_empaque;
create policy "regla_empaque_gestion" on public.regla_empaque for all to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'COMPRADOR']))
  with check (public.tiene_rol(array['ADMINISTRADOR', 'COMPRADOR']));

drop policy if exists "proveedor_gestion" on public.proveedor;
create policy "proveedor_gestion" on public.proveedor for all to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'COMPRADOR']))
  with check (public.tiene_rol(array['ADMINISTRADOR', 'COMPRADOR']));

drop policy if exists "orden_importacion_gestion" on public.orden_importacion;
create policy "orden_importacion_gestion" on public.orden_importacion for all to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'COMPRADOR']))
  with check (public.tiene_rol(array['ADMINISTRADOR', 'COMPRADOR']));

drop policy if exists "detalle_orden_gestion" on public.detalle_orden;
create policy "detalle_orden_gestion" on public.detalle_orden for all to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'COMPRADOR']))
  with check (public.tiene_rol(array['ADMINISTRADOR', 'COMPRADOR']));

drop policy if exists "almacen_gestion" on public.almacen;
create policy "almacen_gestion" on public.almacen for all to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR']))
  with check (public.tiene_rol(array['ADMINISTRADOR']));

drop policy if exists "inventario_gestion" on public.inventario;
create policy "inventario_gestion" on public.inventario for all to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'OPERARIO']))
  with check (public.tiene_rol(array['ADMINISTRADOR', 'OPERARIO']));

drop policy if exists "sesion_recepcion_insertar" on public.sesion_recepcion;
create policy "sesion_recepcion_insertar" on public.sesion_recepcion for insert to authenticated
  with check (public.tiene_rol(array['ADMINISTRADOR', 'OPERARIO']));

drop policy if exists "sesion_recepcion_actualizar" on public.sesion_recepcion;
create policy "sesion_recepcion_actualizar" on public.sesion_recepcion for update to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'OPERARIO']))
  with check (public.tiene_rol(array['ADMINISTRADOR', 'OPERARIO']));

drop policy if exists "recepcion_lectura_insertar" on public.recepcion_lectura;
create policy "recepcion_lectura_insertar" on public.recepcion_lectura for insert to authenticated
  with check (public.tiene_rol(array['ADMINISTRADOR', 'OPERARIO']));

drop policy if exists "etiqueta_rfid_insertar" on public.etiqueta_rfid;
create policy "etiqueta_rfid_insertar" on public.etiqueta_rfid for insert to authenticated
  with check (public.tiene_rol(array['ADMINISTRADOR', 'OPERARIO']));

drop policy if exists "etiqueta_rfid_actualizar" on public.etiqueta_rfid;
create policy "etiqueta_rfid_actualizar" on public.etiqueta_rfid for update to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'OPERARIO']))
  with check (public.tiene_rol(array['ADMINISTRADOR', 'OPERARIO']));

drop policy if exists "conciliacion_ciega_gestion" on public.conciliacion_ciega;
create policy "conciliacion_ciega_gestion" on public.conciliacion_ciega for all to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'OPERARIO']))
  with check (public.tiene_rol(array['ADMINISTRADOR', 'OPERARIO']));

drop policy if exists "movimiento_insertar" on public.movimiento;
create policy "movimiento_insertar" on public.movimiento for insert to authenticated
  with check (public.tiene_rol(array['ADMINISTRADOR', 'OPERARIO']));

drop policy if exists "auditoria_catalogo_lectura" on public.auditoria_catalogo;
create policy "auditoria_catalogo_lectura" on public.auditoria_catalogo for select to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'COMPRADOR', 'AUDITOR']));

drop policy if exists "auditoria_catalogo_insert" on public.auditoria_catalogo;
create policy "auditoria_catalogo_insert" on public.auditoria_catalogo for insert to authenticated
  with check (true);

-- ------------------------------------------------------------------------------
-- 11. DATOS SEMILLA BÁSICOS Y MAESTROS DE PRUEBA (SEED DATA)
-- ------------------------------------------------------------------------------
insert into public.rol (nombre_rol, descripcion, activo)
values
  ('ADMINISTRADOR', 'Control total del sistema', true),
  ('COMPRADOR', 'Gestiona pedidos e importaciones', true),
  ('OPERARIO', 'Ejecuta escaneo RFID y recepción', true),
  ('AUDITOR', 'Realiza auditorías ERI y conciliación', true)
on conflict (nombre_rol) do update set descripcion = excluded.descripcion, activo = true;

insert into public.almacen (id_almacen, nombre, tipo, capacidad_m3, activo)
overriding system value
values
  (1, 'Almacén Principal', 'PRINCIPAL', 500, true),
  (2, 'Tienda Central', 'TIENDA', 80, true),
  (3, 'Mermas', 'MERMA', 20, true)
on conflict (nombre) do nothing;

-- A. Proveedor de prueba
insert into public.proveedor (id_proveedor, razon_social, calificacion_otif, tiempo_lead_time_dias, activo)
overriding system value
values (1, 'Zhejiang Shalom Trading Co., Ltd.', 96.5, 35, true)
on conflict (razon_social) do update set
  calificacion_otif = 96.5,
  tiempo_lead_time_dias = 35,
  activo = true;

-- B. Producto de prueba (SKU con alta rotación)
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

-- C. Regla de empaque del producto:
-- 10 unid/caja, 30 cajas/paleta = 300 unidades por paleta
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

-- D. Orden de Importación en estado 'TRANSITO'
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

-- E. Detalle de Orden: 980 unidades pedidas
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

-- F. Inicialización en inventario con stock 0
insert into public.inventario (id_producto, id_almacen, stock_real, stock_minimo, estado_semaforo)
values (1, 1, 0, 300, 'ROJO')
on conflict (id_producto, id_almacen) do nothing;
