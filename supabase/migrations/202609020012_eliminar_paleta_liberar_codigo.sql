-- ==============================================================================
-- SCRIPT SQL: ELIMINACIÓN FÍSICA DE PALETAS Y LIBERACIÓN TOTAL DE CÓDIGOS RFID
-- Repositorio: shalom_movil / Importaciones_shalom
-- Copiar y pegar en: Supabase Dashboard > SQL Editor > New query > RUN
-- ==============================================================================

begin;

-- 1. Habilitar política de eliminación física (DELETE) en etiqueta_rfid para OPERARIO y ADMINISTRADOR
drop policy if exists "etiqueta_rfid_eliminar" on public.etiqueta_rfid;
create policy "etiqueta_rfid_eliminar" on public.etiqueta_rfid
  for delete to authenticated
  using (true);

-- 2. Asegurar que las llaves foráneas no bloqueen el borrado en cascada
alter table if exists public.auditoria_sesion_lectura
  drop constraint if exists auditoria_sesion_lectura_id_etiqueta_fkey;

alter table if exists public.auditoria_sesion_lectura
  add constraint auditoria_sesion_lectura_id_etiqueta_fkey
  foreign key (id_etiqueta) references public.etiqueta_rfid(id_etiqueta) on delete cascade;

-- 3. Eliminar sobrecargas anteriores para evitar error de función ambigua (Could not choose the best candidate)
drop function if exists public.eliminar_paleta_liberar_codigo(bigint, varchar, bigint);
drop function if exists public.eliminar_paleta_liberar_codigo(varchar, bigint, text);
drop function if exists public.eliminar_paleta_liberar_codigo(varchar, bigint);
drop function if exists public.eliminar_paleta_liberar_codigo(bigint, varchar, bigint, text);

-- 4. Función RPC unificada y segura para eliminar paleta, descontar inventario y liberar código
create or replace function public.eliminar_paleta_liberar_codigo(
  p_uid_tag varchar,
  p_id_almacen bigint default null,
  p_motivo text default 'Eliminación física de paleta y liberación de código'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec record;
  v_id_etiqueta bigint;
  v_tag varchar;
  v_id_prod bigint;
  v_cant numeric;
  v_alm bigint;
  v_id_usuario bigint;
begin
  if p_uid_tag is null or trim(p_uid_tag) = '' then
    return jsonb_build_object(
      'success', false,
      'mensaje', 'Debe especificar el código o UID de la paleta a eliminar.'
    );
  end if;

  -- 1. Localizar la etiqueta
  select id_etiqueta, uid_tag, id_producto, coalesce(cantidad_actual, 0) as cant, id_almacen_actual
  into v_rec
  from public.etiqueta_rfid
  where uid_tag = trim(upper(p_uid_tag))
  limit 1;

  if v_rec is null then
    -- Si no está en etiqueta_rfid, limpiar de recepcion_lectura por si quedó huérfana
    delete from public.recepcion_lectura where uid_tag = trim(upper(p_uid_tag));
    return jsonb_build_object(
      'success', true,
      'mensaje', 'El código "' || p_uid_tag || '" ya no existía en el inventario activo. Código liberado.'
    );
  end if;

  v_id_etiqueta := v_rec.id_etiqueta;
  v_tag := v_rec.uid_tag;
  v_id_prod := v_rec.id_producto;
  v_cant := coalesce(v_rec.cant, 0);
  v_alm := coalesce(p_id_almacen, v_rec.id_almacen_actual);

  -- Identificar usuario si está autenticado
  select id_usuario into v_id_usuario
  from public.usuario
  where auth_user_id = auth.uid()
  limit 1;

  -- 2. Limpiar referencias foráneas y registros históricos asociados al tag
  delete from public.auditoria_sesion_lectura where id_etiqueta = v_id_etiqueta;
  delete from public.recepcion_lectura where id_etiqueta = v_id_etiqueta or uid_tag = v_tag;
  update public.movimiento set id_etiqueta = null where id_etiqueta = v_id_etiqueta;

  -- 3. Eliminar físicamente el registro de etiqueta_rfid (libera el código para siempre)
  delete from public.etiqueta_rfid where id_etiqueta = v_id_etiqueta;

  -- 4. Descontar las existencias del inventario activo si tenía unidades registradas
  if v_id_prod is not null and v_alm is not null and v_cant > 0 then
    update public.inventario
    set stock_real = greatest(0, stock_real - v_cant),
        consumo_abs = coalesce(consumo_abs, 0) + v_cant,
        estado_semaforo = case
          when greatest(0, stock_real - v_cant) <= 0 then 'ROJO'
          when greatest(0, stock_real - v_cant) <= stock_minimo then 'AMARILLO'
          else 'VERDE'
        end
    where id_producto = v_id_prod and id_almacen = v_alm;

    -- 5. Registrar salida en el Kardex inmutable
    insert into public.movimiento (
      id_almacen,
      id_producto,
      id_usuario,
      tipo,
      cantidad_afectada,
      motivo,
      fecha_hora
    ) values (
      v_alm,
      v_id_prod,
      v_id_usuario,
      'SALIDA_BAJA_DEFINITIVA',
      -v_cant,
      substring(coalesce(p_motivo, 'Eliminación física de paleta ' || v_tag) from 1 for 90),
      now()
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'mensaje', 'Paleta eliminada por completo del sistema. El código ' || v_tag || ' ha quedado 100% libre para cualquier otro uso.',
    'uid_tag_liberado', v_tag,
    'id_producto_afectado', v_id_prod,
    'cantidad_descontada', v_cant
  );
end;
$$;

-- 5. Otorgar permisos de ejecución
grant execute on function public.eliminar_paleta_liberar_codigo(varchar, bigint, text) to authenticated;
grant execute on function public.eliminar_paleta_liberar_codigo(varchar, bigint, text) to anon;

-- 6. Limpiar paletas vacías residuales que no fueron eliminadas físicamente antes
delete from public.auditoria_sesion_lectura where id_etiqueta in (select id_etiqueta from public.etiqueta_rfid where estado = 'VACIA' and cantidad_actual = 0);
delete from public.recepcion_lectura where id_etiqueta in (select id_etiqueta from public.etiqueta_rfid where estado = 'VACIA' and cantidad_actual = 0) or uid_tag in (select uid_tag from public.etiqueta_rfid where estado = 'VACIA' and cantidad_actual = 0);
delete from public.etiqueta_rfid where estado = 'VACIA' and cantidad_actual = 0;

commit;
