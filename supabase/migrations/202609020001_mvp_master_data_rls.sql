-- Seguridad del MVP: maestros e inventario.
-- El stock no se modifica desde el navegador: posteriormente se hará solo con RPC
-- transaccional para conservar la trazabilidad de movimientos.

create or replace function public.tiene_rol(roles_permitidos text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuario u
    join public.usuario_rol ur on ur.id_usuario = u.id_usuario and ur.activo
    join public.rol r on r.id_rol = ur.id_rol and r.activo
    where u.auth_user_id = auth.uid()
      and u.activo
      and r.nombre_rol::text = any(roles_permitidos)
  );
$$;

grant execute on function public.tiene_rol(text[]) to authenticated;

create unique index if not exists permiso_modulo_accion_unico
  on public.permiso (codigo_modulo, accion);

insert into public.permiso (codigo_modulo, accion)
values
  ('PRODUCTOS', 'VER'), ('PRODUCTOS', 'CREAR'), ('PRODUCTOS', 'EDITAR'),
  ('ALMACENES', 'VER'), ('ALMACENES', 'EDITAR'),
  ('INVENTARIO', 'VER')
on conflict (codigo_modulo, accion) do nothing;

insert into public.rol_permiso (id_rol, id_permiso)
select r.id_rol, p.id_permiso
from public.rol r
cross join public.permiso p
where (
  r.nombre_rol = 'ADMINISTRADOR'
  or (r.nombre_rol = 'COMPRADOR' and p.codigo_modulo = 'PRODUCTOS')
  or (r.nombre_rol = 'OPERARIO' and p.codigo_modulo = 'INVENTARIO')
  or (r.nombre_rol = 'AUDITOR' and p.codigo_modulo = 'INVENTARIO')
)
  and not exists (
    select 1 from public.rol_permiso rp
    where rp.id_rol = r.id_rol and rp.id_permiso = p.id_permiso
  );

alter table public.categoria enable row level security;
alter table public.producto enable row level security;
alter table public.regla_empaque enable row level security;
alter table public.almacen enable row level security;
alter table public.inventario enable row level security;

create policy "categoria_mvp_lectura" on public.categoria
  for select to authenticated using (true);
create policy "categoria_mvp_edicion" on public.categoria
  for all to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'COMPRADOR']))
  with check (public.tiene_rol(array['ADMINISTRADOR', 'COMPRADOR']));

create policy "producto_mvp_lectura" on public.producto
  for select to authenticated using (true);
create policy "producto_mvp_edicion" on public.producto
  for all to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'COMPRADOR']))
  with check (public.tiene_rol(array['ADMINISTRADOR', 'COMPRADOR']));

create policy "regla_empaque_mvp_lectura" on public.regla_empaque
  for select to authenticated using (true);
create policy "regla_empaque_mvp_edicion" on public.regla_empaque
  for all to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'COMPRADOR']))
  with check (public.tiene_rol(array['ADMINISTRADOR', 'COMPRADOR']));

create policy "almacen_mvp_lectura" on public.almacen
  for select to authenticated using (true);
create policy "almacen_mvp_edicion" on public.almacen
  for all to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR']))
  with check (public.tiene_rol(array['ADMINISTRADOR']));

create policy "inventario_mvp_lectura" on public.inventario
  for select to authenticated
  using (public.tiene_rol(array['ADMINISTRADOR', 'COMPRADOR', 'OPERARIO', 'AUDITOR']));
