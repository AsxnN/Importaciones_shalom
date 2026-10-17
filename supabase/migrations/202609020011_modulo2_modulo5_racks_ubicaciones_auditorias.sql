-- ==============================================================================
-- Migración: Módulo 2 & Módulo 5 - Racks Drive-In, Ubicaciones y Auditorías ERI
-- Sistema de inventario RFID - Importaciones Shalom
-- ==============================================================================

-- 1. ESTRUCTURA FÍSICA: CARRILES DRIVE-IN (ENTRADAS / TÚNELES)
create table if not exists public.carril (
  id_carril bigint generated always as identity primary key,
  id_almacen bigint not null references public.almacen(id_almacen) on delete cascade,
  codigo_carril varchar(50) not null,
  nombre varchar(100),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  constraint uq_carril_almacen unique (id_almacen, codigo_carril)
);

-- 2. NIVELES POR CARRIL (CADA NIVEL DEFINE SU PROPIA PROFUNDIDAD DE PALETAS)
create table if not exists public.nivel_carril (
  id_nivel bigint generated always as identity primary key,
  id_carril bigint not null references public.carril(id_carril) on delete cascade,
  numero_nivel integer not null check (numero_nivel >= 1),
  nombre_nivel varchar(50),
  capacidad_paletas integer not null default 1 check (capacidad_paletas >= 0),
  created_at timestamptz not null default now(),
  constraint uq_nivel_carril unique (id_carril, numero_nivel)
);

-- 3. CELDAS Y UBICACIONES FÍSICAS INDIVIDUALES (RACK DRIVE-IN Y ZONA CAMPO)
create table if not exists public.celda_rack (
  id_celda bigint generated always as identity primary key,
  id_almacen bigint not null references public.almacen(id_almacen) on delete cascade,
  tipo_ubicacion varchar(20) not null default 'RACK' check (tipo_ubicacion in ('RACK', 'CAMPO')),
  id_carril bigint references public.carril(id_carril) on delete cascade,
  id_nivel bigint references public.nivel_carril(id_nivel) on delete cascade,
  posicion_fondo integer check (posicion_fondo is null or posicion_fondo >= 1),
  codigo_ubicacion varchar(100) not null,
  descripcion varchar(200),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  constraint uq_celda_almacen_codigo unique (id_almacen, codigo_ubicacion)
);

-- 4. EXTENSIÓN DE ETIQUETA_RFID PARA VINCULACIÓN CON CELDAS Y CÓDIGO DE BARRAS
alter table public.etiqueta_rfid 
  add column if not exists id_celda bigint references public.celda_rack(id_celda) on delete set null;

alter table public.etiqueta_rfid 
  add column if not exists codigo_barras varchar(100);

alter table public.etiqueta_rfid 
  add column if not exists notas text;

-- 5. TABLAS PARA AUDITORÍAS ERI Y CONTEO POR PRODUCTO (MÓDULO 5)

-- Cabecera de Auditoría
create table if not exists public.auditoria_sesion (
  id_auditoria bigint generated always as identity primary key,
  id_almacen bigint not null references public.almacen(id_almacen) on delete cascade,
  id_usuario bigint references public.usuario(id_usuario) on delete set null,
  fecha_inicio timestamptz not null default now(),
  fecha_fin timestamptz,
  estado varchar(20) not null default 'EN_PROCESO' check (estado in ('EN_PROCESO', 'PARCIAL', 'COMPLETADA')),
  total_productos integer not null default 0,
  productos_auditados integer not null default 0,
  paletas_esperadas integer not null default 0,
  paletas_auditadas integer not null default 0,
  porcentaje_eri numeric default 0 check (porcentaje_eri is null or (porcentaje_eri >= 0 and porcentaje_eri <= 100)),
  observaciones text,
  created_at timestamptz not null default now()
);

-- Detalle por Producto dentro de la Auditoría
create table if not exists public.auditoria_sesion_producto (
  id_auditoria_prod bigint generated always as identity primary key,
  id_auditoria bigint not null references public.auditoria_sesion(id_auditoria) on delete cascade,
  id_producto bigint not null references public.producto(id_producto),
  paletas_esperadas integer not null default 0,
  paletas_leidas integer not null default 0,
  estado varchar(20) not null default 'PENDIENTE' check (estado in ('PENDIENTE', 'AUDITADO')),
  nota_confirmacion text,
  fecha_confirmacion timestamptz,
  constraint uq_auditoria_sesion_producto unique (id_auditoria, id_producto)
);

-- Detalle de Paletas por Producto en la Auditoría
create table if not exists public.auditoria_sesion_lectura (
  id_lectura bigint generated always as identity primary key,
  id_auditoria bigint not null references public.auditoria_sesion(id_auditoria) on delete cascade,
  id_auditoria_prod bigint not null references public.auditoria_sesion_producto(id_auditoria_prod) on delete cascade,
  id_etiqueta bigint not null references public.etiqueta_rfid(id_etiqueta),
  id_producto bigint not null references public.producto(id_producto),
  id_celda bigint references public.celda_rack(id_celda),
  codigo_ubicacion_esperada varchar(100),
  leido boolean not null default false,
  metodo_lectura varchar(20) check (metodo_lectura is null or metodo_lectura in ('RFID', 'CODIGO_BARRAS', 'MANUAL')),
  fecha_lectura timestamptz,
  constraint uq_auditoria_sesion_etiqueta unique (id_auditoria, id_etiqueta)
);

-- 6. HABILITAR ROW LEVEL SECURITY (RLS)
alter table public.carril enable row level security;
alter table public.nivel_carril enable row level security;
alter table public.celda_rack enable row level security;
alter table public.auditoria_sesion enable row level security;
alter table public.auditoria_sesion_producto enable row level security;
alter table public.auditoria_sesion_lectura enable row level security;

-- 7. POLÍTICAS RLS

-- Carril
drop policy if exists "carril_lectura" on public.carril;
create policy "carril_lectura" on public.carril for select to authenticated using (true);

drop policy if exists "carril_gestion" on public.carril;
create policy "carril_gestion" on public.carril for all to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'OPERARIO']))
  with check (public.tiene_rol(array['ADMINISTRADOR', 'OPERARIO']));

-- Nivel Carril
drop policy if exists "nivel_carril_lectura" on public.nivel_carril;
create policy "nivel_carril_lectura" on public.nivel_carril for select to authenticated using (true);

drop policy if exists "nivel_carril_gestion" on public.nivel_carril;
create policy "nivel_carril_gestion" on public.nivel_carril for all to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'OPERARIO']))
  with check (public.tiene_rol(array['ADMINISTRADOR', 'OPERARIO']));

-- Celda Rack
drop policy if exists "celda_rack_lectura" on public.celda_rack;
create policy "celda_rack_lectura" on public.celda_rack for select to authenticated using (true);

drop policy if exists "celda_rack_gestion" on public.celda_rack;
create policy "celda_rack_gestion" on public.celda_rack for all to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'OPERARIO']))
  with check (public.tiene_rol(array['ADMINISTRADOR', 'OPERARIO']));

-- Auditorías
drop policy if exists "auditoria_sesion_lectura" on public.auditoria_sesion;
create policy "auditoria_sesion_lectura" on public.auditoria_sesion for select to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'AUDITOR', 'OPERARIO']));

drop policy if exists "auditoria_sesion_gestion" on public.auditoria_sesion;
create policy "auditoria_sesion_gestion" on public.auditoria_sesion for all to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'AUDITOR']))
  with check (public.tiene_rol(array['ADMINISTRADOR', 'AUDITOR']));

drop policy if exists "auditoria_producto_lectura" on public.auditoria_sesion_producto;
create policy "auditoria_producto_lectura" on public.auditoria_sesion_producto for select to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'AUDITOR', 'OPERARIO']));

drop policy if exists "auditoria_producto_gestion" on public.auditoria_sesion_producto;
create policy "auditoria_producto_gestion" on public.auditoria_sesion_producto for all to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'AUDITOR']))
  with check (public.tiene_rol(array['ADMINISTRADOR', 'AUDITOR']));

drop policy if exists "auditoria_lectura_lectura" on public.auditoria_sesion_lectura;
create policy "auditoria_lectura_lectura" on public.auditoria_sesion_lectura for select to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'AUDITOR', 'OPERARIO']));

drop policy if exists "auditoria_lectura_gestion" on public.auditoria_sesion_lectura;
create policy "auditoria_lectura_gestion" on public.auditoria_sesion_lectura for all to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'AUDITOR']))
  with check (public.tiene_rol(array['ADMINISTRADOR', 'AUDITOR']));

-- 8. FUNCIONES RPC

-- Asegurar Zona Campo para un almacén
create or replace function public.asegurar_zona_campo(p_id_almacen bigint)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare
  v_id_celda bigint;
  v_codigo varchar;
begin
  v_codigo := 'ALM' || p_id_almacen::text || '-CAMPO';
  select id_celda into v_id_celda
  from public.celda_rack
  where id_almacen = p_id_almacen and tipo_ubicacion = 'CAMPO';

  if v_id_celda is null then
    insert into public.celda_rack (
      id_almacen, tipo_ubicacion, codigo_ubicacion, descripcion
    ) values (
      p_id_almacen, 'CAMPO', v_codigo, 'Zona de Piso / Almacenamiento Libre en Campo'
    ) returning id_celda into v_id_celda;
  end if;

  return v_id_celda;
end;
$$;

-- Configurar un Carril Drive-In con sus Niveles y Celdas Automáticas
create or replace function public.configurar_carril_drivein(
  p_id_almacen bigint,
  p_codigo_carril varchar,
  p_nombre varchar,
  p_niveles jsonb
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_id_carril bigint;
  v_item jsonb;
  v_num_nivel integer;
  v_capacidad integer;
  v_id_nivel bigint;
  v_pos integer;
  v_codigo_celda varchar;
  v_total_celdas integer := 0;
begin
  if not (public.tiene_rol(array['ADMINISTRADOR', 'OPERARIO'])) then
    raise exception 'Acceso denegado: permisos insuficientes para configurar racks.';
  end if;

  -- 1. Crear o actualizar Carril
  insert into public.carril (id_almacen, codigo_carril, nombre)
  values (p_id_almacen, trim(upper(p_codigo_carril)), coalesce(p_nombre, 'Carril ' || trim(upper(p_codigo_carril))))
  on conflict (id_almacen, codigo_carril)
  do update set nombre = excluded.nombre, activo = true
  returning id_carril into v_id_carril;

  -- 2. Procesar cada nivel
  for v_item in select * from jsonb_array_elements(p_niveles)
  loop
    v_num_nivel := (v_item->>'numero_nivel')::integer;
    v_capacidad := (v_item->>'capacidad_paletas')::integer;

    if v_num_nivel > 0 and v_capacidad >= 0 then
      insert into public.nivel_carril (id_carril, numero_nivel, nombre_nivel, capacidad_paletas)
      values (v_id_carril, v_num_nivel, 'Nivel ' || v_num_nivel, v_capacidad)
      on conflict (id_carril, numero_nivel)
      do update set capacidad_paletas = excluded.capacidad_paletas
      returning id_nivel into v_id_nivel;

      -- Generar celdas en profundidad (1 = Fondo ... N = Frente)
      for v_pos in 1..v_capacidad
      loop
        v_codigo_celda := trim(upper(p_codigo_carril)) || '-N' || lpad(v_num_nivel::text, 2, '0') || '-P' || lpad(v_pos::text, 2, '0');
        
        insert into public.celda_rack (
          id_almacen, tipo_ubicacion, id_carril, id_nivel, posicion_fondo, codigo_ubicacion, descripcion
        ) values (
          p_id_almacen, 'RACK', v_id_carril, v_id_nivel, v_pos, v_codigo_celda,
          'Carril ' || trim(upper(p_codigo_carril)) || ' / Nivel ' || v_num_nivel || ' / Fondo Pos ' || v_pos
        )
        on conflict (id_almacen, codigo_ubicacion)
        do update set activo = true, id_nivel = excluded.id_nivel, posicion_fondo = excluded.posicion_fondo;

        v_total_celdas := v_total_celdas + 1;
      end loop;
    end if;
  end loop;

  -- Asegurar zona de campo
  perform public.asegurar_zona_campo(p_id_almacen);

  return jsonb_build_object(
    'id_carril', v_id_carril,
    'codigo_carril', trim(upper(p_codigo_carril)),
    'celdas_generadas', v_total_celdas
  );
end;
$$;
