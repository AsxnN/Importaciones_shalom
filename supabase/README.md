# Configuración inicial de seguridad

1. En Supabase, cree manualmente el primer usuario en **Authentication > Users**.
2. Ejecute la migración `migrations/202609010001_auth_rbac.sql` en el SQL Editor. Si sus tablas preexistentes usan otros tipos o nombres de columnas, ajuste la migración antes de ejecutarla.
3. Vincule el usuario inicial como administrador, reemplazando el correo:

```sql
insert into public.usuario (auth_user_id, nombre_completo, correo, activo)
select id, 'Administrador principal', email, true
from auth.users where email = 'admin@empresa.com'
on conflict (auth_user_id) do update set activo = true;

insert into public.usuario_rol (id_usuario, id_rol, activo)
select u.id_usuario, r.id_rol, true
from public.usuario u cross join public.rol r
where u.correo = 'admin@empresa.com' and r.nombre_rol = 'ADMINISTRADOR'
on conflict do nothing;
```

4. Copie `.env.example` como `.env` en cada PC y complete únicamente la URL y la clave **anon** pública. Nunca distribuya `service_role`.
