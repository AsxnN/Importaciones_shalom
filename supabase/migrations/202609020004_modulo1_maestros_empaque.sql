-- ==============================================================================
-- Migración: Módulo 1 - Maestros y Empaque (Catálogos y Esquemas de Estiba)
-- Incluye:
-- 1. Políticas RLS para la tabla 'proveedor'
-- 2. Tabla 'esquema_camita' con RLS para estibado
-- 3. Tabla 'auditoria_catalogo' para trazabilidad y auditoría de cambios
-- 4. Verificación y columnas en 'producto' y 'regla_empaque'
-- ==============================================================================

-- 1. PROVEEDOR: Habilitar RLS y crear políticas
alter table if exists public.proveedor enable row level security;

drop policy if exists "proveedor_lectura" on public.proveedor;
create policy "proveedor_lectura" on public.proveedor
  for select to authenticated
  using (true);

drop policy if exists "proveedor_gestion" on public.proveedor;
create policy "proveedor_gestion" on public.proveedor
  for all to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'COMPRADOR']))
  with check (public.tiene_rol(array['ADMINISTRADOR', 'COMPRADOR']));

-- 2. ESQUEMA DE CAMITA: Tabla para paletización y estibado
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

alter table public.esquema_camita enable row level security;

drop policy if exists "esquema_camita_lectura" on public.esquema_camita;
create policy "esquema_camita_lectura" on public.esquema_camita
  for select to authenticated
  using (true);

drop policy if exists "esquema_camita_gestion" on public.esquema_camita;
create policy "esquema_camita_gestion" on public.esquema_camita
  for all to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'COMPRADOR']))
  with check (public.tiene_rol(array['ADMINISTRADOR', 'COMPRADOR']));

-- 3. AUDITORÍA DE CATÁLOGO: Registro de qué usuario, cuándo y qué cambió
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

alter table public.auditoria_catalogo enable row level security;

drop policy if exists "auditoria_catalogo_lectura" on public.auditoria_catalogo;
create policy "auditoria_catalogo_lectura" on public.auditoria_catalogo
  for select to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'COMPRADOR', 'AUDITOR']));

drop policy if exists "auditoria_catalogo_insertar" on public.auditoria_catalogo;
create policy "auditoria_catalogo_insertar" on public.auditoria_catalogo
  for insert to authenticated
  with check (true);

-- Permisos sobre las tablas nuevas
grant select on public.proveedor to authenticated;
grant all on public.proveedor to authenticated;

grant select on public.esquema_camita to authenticated;
grant all on public.esquema_camita to authenticated;

grant select, insert on public.auditoria_catalogo to authenticated;
