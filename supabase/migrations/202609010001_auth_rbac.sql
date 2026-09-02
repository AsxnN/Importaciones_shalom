-- Supuestos: las tablas existentes usan UUID en sus claves y los nombres indicados
-- en el SRS: usuario, rol, usuario_rol, permiso y rol_permiso.
-- Ejecutar primero en un proyecto de prueba y ajustar solo si el esquema previo difiere.

create unique index if not exists rol_nombre_rol_unico on public.rol (nombre_rol);
create unique index if not exists permiso_modulo_accion_unico on public.permiso (codigo_modulo, accion);
create unique index if not exists usuario_auth_user_unico on public.usuario (auth_user_id);

insert into public.rol (nombre_rol, descripcion, activo)
values
  ('ADMINISTRADOR', 'Administración completa del sistema', true),
  ('COMPRADOR', 'Compras, proveedores, productos y órdenes', true),
  ('OPERARIO', 'Recepciones, RFID y movimientos operativos', true),
  ('AUDITOR', 'Auditorías, conciliaciones y lectura de inventario', true)
on conflict (nombre_rol) do update set descripcion = excluded.descripcion, activo = true;

insert into public.permiso (codigo_modulo, accion)
values
  ('PRODUCTOS', 'VER'), ('INVENTARIO', 'VER'), ('ORDENES', 'VER'),
  ('RECEPCIONES', 'VER'), ('AUDITORIAS', 'VER'), ('USUARIOS', 'VER')
on conflict (codigo_modulo, accion) do nothing;

insert into public.rol_permiso (id_rol, id_permiso)
select r.id_rol, p.id_permiso
from public.rol r
join public.permiso p on (
  r.nombre_rol = 'ADMINISTRADOR'
  or (r.nombre_rol = 'COMPRADOR' and p.codigo_modulo in ('PRODUCTOS', 'ORDENES'))
  or (r.nombre_rol = 'OPERARIO' and p.codigo_modulo in ('INVENTARIO', 'RECEPCIONES'))
  or (r.nombre_rol = 'AUDITOR' and p.codigo_modulo in ('INVENTARIO', 'RECEPCIONES', 'AUDITORIAS'))
)
on conflict do nothing;

-- Esta función evita que las políticas RLS consulten tablas de roles de forma recursiva.
create or replace function public.es_administrador()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from usuario_rol ur
    join usuario u on u.id_usuario = ur.id_usuario
    join rol r on r.id_rol = ur.id_rol
    where u.auth_user_id = auth.uid() and u.activo and ur.activo
      and r.activo and r.nombre_rol = 'ADMINISTRADOR'
  );
$$;

create or replace function public.mi_perfil_acceso()
returns table (nombre_completo text, roles text[], permisos text[])
language sql stable security definer set search_path = public
as $$
  select u.nombre_completo::text,
    coalesce(array_agg(distinct r.nombre_rol::text) filter (where r.nombre_rol is not null), '{}')::text[],
    coalesce(array_agg(distinct p.codigo_modulo || '.' || p.accion) filter (where p.id_permiso is not null), '{}')::text[]
  from usuario u
  left join usuario_rol ur on ur.id_usuario = u.id_usuario and ur.activo
  left join rol r on r.id_rol = ur.id_rol and r.activo
  left join rol_permiso rp on rp.id_rol = r.id_rol
  left join permiso p on p.id_permiso = rp.id_permiso
  where u.auth_user_id = auth.uid() and u.activo
  group by u.id_usuario, u.nombre_completo;
$$;

revoke all on function public.es_administrador() from public;
revoke all on function public.mi_perfil_acceso() from public;
grant execute on function public.es_administrador() to authenticated;
grant execute on function public.mi_perfil_acceso() to authenticated;

alter table public.usuario enable row level security;
alter table public.rol enable row level security;
alter table public.usuario_rol enable row level security;
alter table public.permiso enable row level security;
alter table public.rol_permiso enable row level security;

create policy "usuario: leer perfil propio o administrar" on public.usuario for select to authenticated using (auth_user_id = auth.uid() or public.es_administrador());
create policy "usuario: administrar" on public.usuario for all to authenticated using (public.es_administrador()) with check (public.es_administrador());
create policy "rol: lectura autenticada" on public.rol for select to authenticated using (true);
create policy "rol: administrar" on public.rol for all to authenticated using (public.es_administrador()) with check (public.es_administrador());
create policy "usuario_rol: leer propio o administrar" on public.usuario_rol for select to authenticated using (public.es_administrador() or id_usuario in (select id_usuario from public.usuario where auth_user_id = auth.uid()));
create policy "usuario_rol: administrar" on public.usuario_rol for all to authenticated using (public.es_administrador()) with check (public.es_administrador());
create policy "permiso: lectura autenticada" on public.permiso for select to authenticated using (true);
create policy "rol_permiso: lectura autenticada" on public.rol_permiso for select to authenticated using (true);
create policy "permisos: administrar" on public.permiso for all to authenticated using (public.es_administrador()) with check (public.es_administrador());
create policy "rol_permisos: administrar" on public.rol_permiso for all to authenticated using (public.es_administrador()) with check (public.es_administrador());
