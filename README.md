# Importaciones Shalom · Sistema Táctico de Inventarios

Sistema inteligente de gestión de inventarios, cubicaje y estibado, trazabilidad de existencias, conciliación ciega de importaciones con App Móvil y auditorías de exactitud de registro (ERI).

---

## 📖 Documentación Maestra y Contexto del Sistema

> **Para conocer la arquitectura completa, el desglose de cada módulo y las conexiones detalladas con Supabase, consulta:**  
> 👉 **[`CONTEXTO_SISTEMA.md`](./CONTEXTO_SISTEMA.md)**

Cualquier cambio de código en la aplicación debe actualizar dicho archivo siguiendo las pautas de [`AGENTS.md`](./AGENTS.md).

---

## 🛠️ Stack Tecnológico

- **Frontend Web:** React 19, TypeScript ~6.0, Vite 8, Oxlint.
- **App Móvil Operativa:** Aplicación móvil táctica para operarios de almacén y muelle (escaneo NFC/cámara/Bluetooth, alertas hápticas y cola offline).
- **Backend & BD:** Supabase (PostgreSQL 17, RLS, RPCs transaccionales, Storage).

---

## 🚀 Inicio Rápido

1. **Instalar dependencias:**
   ```bash
   npm install
   ```

2. **Configurar variables de entorno:**
   Copia `.env.example` a `.env` y define tus credenciales de Supabase:
   ```env
   VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
   VITE_SUPABASE_ANON_KEY=tu_clave_anonima_publica
   ```

3. **Ejecutar en desarrollo:**
   ```bash
   npm run dev
   ```

4. **Compilar y validar tipos:**
   ```bash
   npm run build
   npm run lint
   ```
