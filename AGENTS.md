# Reglas y Protocolos del Proyecto — Importaciones Shalom

## Documento Maestro de Contexto
El archivo `/home/ludam/Importaciones/Importaciones_shalom/CONTEXTO_SISTEMA.md` es la **Fuente de Verdad** técnica y arquitectónica del sistema.

## Protocolo Obligatorio para Desarrolladores y Agentes IA
Cada vez que realices modificaciones en este repositorio:
1. **Identifica el módulo afectado:**
   - Módulo 0: Autenticación, Seguridad y RBAC (`src/auth/`, `src/lib/roles.ts`, `src/lib/supabase.ts`)
   - Módulo 1 (MOD-01): Maestros y Empaque (`src/pages/ProductsPage.tsx`, `src/pages/products/`)
   - Módulo 2 (MOD-02): Inventario, Almacenes y Kardex (`src/pages/InventoryPage.tsx`)
   - Módulo 3 (MOD-03): Compras e Importaciones
   - Módulo 4 (MOD-04): Recepción Táctica y App Móvil
   - Módulo 5 (MOD-05): Auditorías ERI y Conciliación Ciega
   - Módulo 6 (MOD-06): Administración de Usuarios y Auditoría Global (`src/lib/audit.ts`)
2. **Actualiza `CONTEXTO_SISTEMA.md`:**
   - Si creas, modificas o eliminas componentes o subcomponentes en `src/`, actualiza la lista de componentes frontend del módulo.
   - Si agregas o cambias migraciones, tablas, columnas, RPCs, políticas RLS o Storage en `supabase/`, actualiza la sección de conexiones con Supabase y las tablas de resumen.
   - Si cambia el estado de implementación de un módulo (ej. de en desarrollo a operativo), actualiza el indicador de estado.
   - Añade una entrada con la fecha y descripción del cambio en la sección **8. Historial de Versiones del Contexto (Changelog)** de `CONTEXTO_SISTEMA.md`.

## 3. Protocolo y Sistema de Diseño Visual Obligatorio (`skill_design.md`)
Al crear, diseñar, extender o modificar cualquier vista, pantalla o componente en el sistema, debes cumplir estrictamente con las directrices de `skill_design.md`:

### 3.1 Tokens Oficiales de Color
- `--color-canvas`: `#F2F6F8` — Fondo principal de la aplicación.
- `--color-surface`: `#FFFFFF` — Paneles, tablas, formularios, tarjetas y diálogos.
- `--color-brand-deep`: `#123D4A` — Sidebar fijo, títulos de página y anclas visuales principales.
- `--color-brand`: `#167D8D` — Botones primarios, navegación activa, filas seleccionadas, enlaces.
- `--color-brand-soft`: `#E4F1F3` — Fondo de filas seleccionadas, focus, badges sutiles.
- `--color-text-primary`: `#123D4A` — Encabezados, datos clave y contenido principal.
- `--color-text-secondary`: `#627985` — Descripciones, metadatos, cabeceras de tablas.
- `--color-border`: `#D8E3E7` — Bordes estructurales de tablas, divisores e inputs.
- `--color-warning`: `#BC791F` — Estados de atención operativa (bajo stock, validaciones pendientes).
- `--color-danger`: `#B3402A` — Acciones destructivas, quiebres de stock o errores críticos.
- `--color-success`: `#2F7D4F` — Confirmaciones positivas o completadas.

### 3.2 Tipografía
- **Display y Encabezados:** `Barlow Semi Condensed` (pesos 500, 600, 700). Título de página: 28–32 px, semibold. Título de sección: 20–24 px, semibold.
- **Cuerpo, Tablas y Formularios:** `Source Sans 3` (pesos 400, 500, 600). Cuerpo: 15–16 px regular. Texto de tabla: 14–15 px regular. Metadatos: 13–14 px regular. Botones: 14–15 px medium.
- **Regla Estricta:** Usar siempre *sentence case*; nunca utilizar ALL CAPS para navegación, cabeceras de tablas ni etiquetas.
- Encabezados siempre alineados a la izquierda y sin cursivas.
- No utilizar tipografía monospace para etiquetas normales de datos.

### 3.3 Sistema de Layout
- **Sidebar Fijo:** Ancho de 220 px, fondo `--color-brand-deep`, texto blanco/claro (`#FFFFFF`, `#E4F1F3`), scrollable y escalable agrupado por tareas del usuario, con perfil y cierre de sesión al pie.
- **Cabecera (Header):** Migas de pan (breadcrumb), estado del contexto operativo y controles de tema/acciones.
- **Espacio de Trabajo (Workspace):** Fondo `--color-canvas`, paneles y tablas en `--color-surface`. Ritmo de espaciado de 16–24 px.
- Priorizar una sola acción primaria por página (`button.primary`).
- Sin sombras decorativas pesadas (`box-shadow: none`); definir la jerarquía visual con bordes de 1 px (`--color-border`) y contraste entre superficies.
- Sin degradados decorativos ni fondos crema o terracota. Mantener la interfaz clara y de alto contraste.

### 3.4 Patrón de Vista Resumen (Dashboard / Overview)
- Tira horizontal de indicadores clave (4 a 6 valores) con mismo peso visual, etiqueta en sentence case, valor numérico, contexto breve y enlace directo.
- Panel de "Atención requerida" priorizado por urgencia operativa (no por módulo). Si no hay pendientes, mostrar: *"No hay tareas pendientes para hoy."*
- Resúmenes compactos por módulo presente con componente uniforme y enlace directo; si el módulo aún no está habilitado, indicar: *"Este módulo aún no está disponible."*
