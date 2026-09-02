-- ==============================================================================
-- Migración: Módulo "Productos y Empaque" (Idempotente y Aditiva)
-- Sistema de inventario RFID - Importaciones Shalom
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. TABLA: categoria
-- ------------------------------------------------------------------------------
create table if not exists public.categoria (
  id_categoria bigint generated always as identity primary key,
  nombre text not null,
  descripcion text not null,
  activo boolean not null default true
);

alter table public.categoria
  add column if not exists activo boolean default true,
  add column if not exists descripcion text;

-- Limpieza explícita para valores nulos históricos antes de aplicar NOT NULL
update public.categoria
set nombre = 'Categoría ' || id_categoria
where nombre is null;

update public.categoria
set descripcion = 'Sin descripción'
where descripcion is null;

update public.categoria
set activo = true
where activo is null;

alter table public.categoria
  alter column nombre set not null,
  alter column descripcion set not null,
  alter column activo set default true,
  alter column activo set not null;

create unique index if not exists categoria_nombre_unico on public.categoria (nombre);

-- ------------------------------------------------------------------------------
-- 2. TABLA: producto
-- ------------------------------------------------------------------------------
create table if not exists public.producto (
  id_producto bigint generated always as identity primary key,
  id_categoria bigint references public.categoria(id_categoria),
  sku text not null,
  descripcion text not null,
  activo boolean not null default true,
  created_at timestamptz default now()
);

alter table public.producto
  add column if not exists id_categoria bigint references public.categoria(id_categoria),
  add column if not exists sku text,
  add column if not exists descripcion text,
  add column if not exists activo boolean default true,
  add column if not exists created_at timestamptz default now();

-- Limpieza explícita de registros históricos
update public.producto
set sku = 'SKU-' || id_producto
where sku is null;

-- Si existe la columna histórica 'nombre', la usamos para inicializar descripcion si estaba vacía
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'producto' and column_name = 'nombre'
  ) then
    execute 'update public.producto set descripcion = coalesce(nullif(descripcion, ''''), nullif(nombre, ''''), ''Sin descripción'') where descripcion is null or descripcion = ''''';
    -- Se elimina la obligatoriedad de nombre para no romper registros que solo envían descripción
    execute 'alter table public.producto alter column nombre drop not null';
  else
    update public.producto set descripcion = 'Sin descripción' where descripcion is null or descripcion = '';
  end if;
end $$;

update public.producto
set activo = true
where activo is null;

alter table public.producto
  alter column sku set not null,
  alter column descripcion set not null,
  alter column activo set default true,
  alter column activo set not null;

create unique index if not exists producto_sku_unico on public.producto (sku);

-- ------------------------------------------------------------------------------
-- 3. TABLA: regla_empaque
-- Modelo con cálculo desacoplado de filas rígidas (apto para cajas rectangulares)
-- ------------------------------------------------------------------------------
create table if not exists public.regla_empaque (
  id_empaque bigint generated always as identity primary key,
  id_producto bigint not null references public.producto(id_producto) on delete cascade,
  unidades_por_caja integer not null check (unidades_por_caja > 0),
  cajas_por_camada integer not null check (cajas_por_camada > 0),
  numero_camadas integer not null check (numero_camadas > 0),
  permite_puchos boolean not null default true,
  notas_armado text,
  imagen_armado_path text,
  largo_caja_cm numeric(10,2),
  ancho_caja_cm numeric(10,2),
  alto_caja_cm numeric(10,2),
  peso_caja_kg numeric(10,3)
);

alter table public.regla_empaque
  add column if not exists id_producto bigint references public.producto(id_producto) on delete cascade,
  add column if not exists unidades_por_caja integer,
  add column if not exists cajas_por_camada integer,
  add column if not exists numero_camadas integer,
  add column if not exists permite_puchos boolean default true,
  add column if not exists notas_armado text,
  add column if not exists imagen_armado_path text,
  add column if not exists largo_caja_cm numeric(10,2),
  add column if not exists ancho_caja_cm numeric(10,2),
  add column if not exists alto_caja_cm numeric(10,2),
  add column if not exists peso_caja_kg numeric(10,3);

-- Migración y preservación de datos históricos existentes en regla_empaque
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'regla_empaque' and column_name = 'cajas_por_camita') then
    execute 'update public.regla_empaque set cajas_por_camada = coalesce(cajas_por_camada, cajas_por_camita) where cajas_por_camada is null';
    execute 'alter table public.regla_empaque alter column cajas_por_camita drop not null';
  end if;

  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'regla_empaque' and column_name = 'cajas_por_fila') then
    execute 'update public.regla_empaque set cajas_por_camada = coalesce(cajas_por_camada, (cajas_por_fila * coalesce(filas_por_camada, 1))) where cajas_por_camada is null';
  end if;

  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'regla_empaque' and column_name = 'camitas_por_paleta') then
    execute 'update public.regla_empaque set numero_camadas = coalesce(numero_camadas, camitas_por_paleta) where numero_camadas is null';
    execute 'alter table public.regla_empaque alter column camitas_por_paleta drop not null';
  end if;
end $$;

update public.regla_empaque set unidades_por_caja = 1 where unidades_por_caja is null or unidades_por_caja <= 0;
update public.regla_empaque set cajas_por_camada = 1 where cajas_por_camada is null or cajas_por_camada <= 0;
update public.regla_empaque set numero_camadas = 1 where numero_camadas is null or numero_camadas <= 0;
update public.regla_empaque set permite_puchos = true where permite_puchos is null;

alter table public.regla_empaque
  alter column unidades_por_caja set not null,
  alter column cajas_por_camada set not null,
  alter column numero_camadas set not null,
  alter column permite_puchos set default true,
  alter column permite_puchos set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'regla_empaque_unidades_por_caja_check') then
    alter table public.regla_empaque add constraint regla_empaque_unidades_por_caja_check check (unidades_por_caja > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'regla_empaque_cajas_por_camada_check') then
    alter table public.regla_empaque add constraint regla_empaque_cajas_por_camada_check check (cajas_por_camada > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'regla_empaque_numero_camadas_check') then
    alter table public.regla_empaque add constraint regla_empaque_numero_camadas_check check (numero_camadas > 0);
  end if;
end $$;

create unique index if not exists regla_empaque_producto_unico on public.regla_empaque (id_producto);

-- ------------------------------------------------------------------------------
-- 4. SEGURIDAD Y POLÍTICAS RLS (Row Level Security)
-- Reutiliza: public.tiene_rol(roles_permitidos text[])
-- ------------------------------------------------------------------------------
alter table public.categoria enable row level security;
alter table public.producto enable row level security;
alter table public.regla_empaque enable row level security;

-- Categoría: lectura autenticada, control total ADMINISTRADOR y COMPRADOR
drop policy if exists "categoria_mvp_lectura" on public.categoria;
drop policy if exists "categoria_lectura" on public.categoria;
create policy "categoria_lectura" on public.categoria
  for select to authenticated
  using (true);

drop policy if exists "categoria_mvp_edicion" on public.categoria;
drop policy if exists "categoria_edicion" on public.categoria;
create policy "categoria_edicion" on public.categoria
  for all to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'COMPRADOR']))
  with check (public.tiene_rol(array['ADMINISTRADOR', 'COMPRADOR']));

-- Producto: lectura autenticada, control total ADMINISTRADOR y COMPRADOR
drop policy if exists "producto_mvp_lectura" on public.producto;
drop policy if exists "producto_lectura" on public.producto;
create policy "producto_lectura" on public.producto
  for select to authenticated
  using (true);

drop policy if exists "producto_mvp_edicion" on public.producto;
drop policy if exists "producto_edicion" on public.producto;
create policy "producto_edicion" on public.producto
  for all to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'COMPRADOR']))
  with check (public.tiene_rol(array['ADMINISTRADOR', 'COMPRADOR']));

-- Regla de empaque: lectura autenticada, control total ADMINISTRADOR y COMPRADOR
drop policy if exists "regla_empaque_mvp_lectura" on public.regla_empaque;
drop policy if exists "regla_empaque_lectura" on public.regla_empaque;
create policy "regla_empaque_lectura" on public.regla_empaque
  for select to authenticated
  using (true);

drop policy if exists "regla_empaque_mvp_edicion" on public.regla_empaque;
drop policy if exists "regla_empaque_edicion" on public.regla_empaque;
create policy "regla_empaque_edicion" on public.regla_empaque
  for all to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'COMPRADOR']))
  with check (public.tiene_rol(array['ADMINISTRADOR', 'COMPRADOR']));

-- ------------------------------------------------------------------------------
-- 5. BUCKET DE SUPABASE STORAGE Y POLÍTICAS DE ACCESO
-- Bucket privado 'esquemas-empaque' para diagramas de armado de camadas
-- ------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'esquemas-empaque',
  'esquemas-empaque',
  false,
  10485760, -- 10 MB
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

-- Políticas en storage.objects
drop policy if exists "storage_esquemas_empaque_select" on storage.objects;
create policy "storage_esquemas_empaque_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'esquemas-empaque'
    and public.tiene_rol(array['ADMINISTRADOR', 'COMPRADOR'])
  );

drop policy if exists "storage_esquemas_empaque_insert" on storage.objects;
create policy "storage_esquemas_empaque_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'esquemas-empaque'
    and public.tiene_rol(array['ADMINISTRADOR', 'COMPRADOR'])
  );

drop policy if exists "storage_esquemas_empaque_update" on storage.objects;
create policy "storage_esquemas_empaque_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'esquemas-empaque'
    and public.tiene_rol(array['ADMINISTRADOR', 'COMPRADOR'])
  )
  with check (
    bucket_id = 'esquemas-empaque'
    and public.tiene_rol(array['ADMINISTRADOR', 'COMPRADOR'])
  );

drop policy if exists "storage_esquemas_empaque_delete" on storage.objects;
create policy "storage_esquemas_empaque_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'esquemas-empaque'
    and public.tiene_rol(array['ADMINISTRADOR', 'COMPRADOR'])
  );

