# AYNI — Gestión de Usuarios

Primera entrega del sistema de compras financiadas e historial crediticio. Proyecto real en **Next.js 16, React, TypeScript y Node.js**, con **Supabase Auth y PostgreSQL**. El backend está dentro de Next.js en `src/app/api`; no necesitas Express ni un segundo servidor.

**Empieza por `GUIA_PASO_A_PASO.md`.** No hay credenciales ni usuarios precargados. La app necesita tu proyecto de Supabase para autenticar y guardar datos. `/vista-previa` muestra exclusivamente el diseño y no concede acceso a cuentas o datos.

## Alcance de esta entrega

- Registro público como Cliente y confirmación de correo.
- Inicio/cierre de sesión y persistencia de sesión administrada por Supabase.
- Recuperación y actualización de contraseña por correo.
- Perfil: consultar/editar nombre y teléfono; consultar correo y rol.
- Administrador: crear cuentas, consultar detalles, buscar por nombre, filtrar, paginar, editar, cambiar rol, activar/desactivar y dar de baja.
- Auditoría de creación y cambios de perfiles, roles y estados.
- Menú lateral, navegación superior, menú de cuenta con hover/clic/teclado y estilos adaptables.
- Inicio y otros cinco módulos con aviso de construcción. Se conserva la imagen facilitada, incluida su marca de agua.

No se implementan todavía evaluación crediticia, compras, pagos, comercios ni financiamiento. No se calculan créditos ni se transmiten historiales a bancos.

## Permisos implementados

| Acción                                | Cliente | Comercio | Entidad financiera | Administrador |
| ------------------------------------- | ------- | -------- | ------------------ | ------------- |
| Iniciar/cerrar sesión                 | Sí      | Sí       | Sí                 | Sí            |
| Consultar y editar su nombre/teléfono | Sí      | Sí       | Sí                 | Sí            |
| Recuperar/cambiar su contraseña       | Sí      | Sí       | Sí                 | Sí            |
| Consultar usuarios ajenos             | No      | No       | No                 | Sí            |
| Crear cuentas desde el panel          | No      | No       | No                 | Sí            |
| Cambiar roles/estados ajenos          | No      | No       | No                 | Sí            |
| Dar de baja usuarios ajenos           | No      | No       | No                 | Sí            |
| Consultar auditoría                   | No      | No       | No                 | Sí            |

Un administrador no puede cambiar su propio rol/estado ni darse de baja. Las cuentas creadas públicamente siempre son Clientes: se ignora cualquier rol enviado en metadatos de registro. Para ascender a alguien, editar su rol desde el listado. La primera cuenta administradora se habilita con el SQL de instalación, no con una ruta pública.

## Arquitectura y datos

- `auth.users`: Supabase gestiona identidad y contraseñas. No se guardan contraseñas en tablas propias.
- `public.profiles`: nombre, correo sincronizado desde Auth, teléfono, rol, estado y fechas.
- `public.user_audit`: actor, afectado, tipo de cambio y estado/rol anterior y nuevo.
- Autenticación del frontend: cliente oficial Supabase con sesión persistente y renovación automática. No usa cookies SSR; usa el token Bearer al llamar al backend.
- Autorización del backend: verifica el token con `auth.getUser(token)` y consulta el rol/estado vigente antes de cada operación.
- Base de datos: RLS por fila, privilegios de columnas y función SQL que revalida al administrador. Las reglas no dependen de ocultar botones.
- Clave secreta: solamente en servidor para crear cuentas en Auth. Nunca usar el prefijo `NEXT_PUBLIC_` en esa clave.
- Baja lógica: estado `eliminado`, fecha y acceso bloqueado; el registro y la auditoría permanecen. No se borra `auth.users`. Desactivar es reversible desde el panel; una baja requiere recuperación técnica desde SQL y no ofrece restauración en esta primera versión.
- Auditoría: la creación inicial y las operaciones del SQL Editor muestran actor “Registro / sistema”; los cambios de rol/perfil realizados con sesión registran `auth.uid()`. Esta auditoría no es un registro de inicios de sesión; estos se consultan en Supabase Auth.

| Endpoint         | Método | Permiso              | Función                       |
| ---------------- | ------ | -------------------- | ----------------------------- |
| `/api/me`        | GET    | Cuenta activa        | Perfil actual                 |
| `/api/me`        | PATCH  | Cuenta activa        | Editar nombre/teléfono propio |
| `/api/users`     | GET    | Administrador activo | Listado paginado y filtros    |
| `/api/users`     | POST   | Administrador activo | Crear cuenta Cliente          |
| `/api/users/:id` | PATCH  | Administrador activo | Datos, rol y estado           |
| `/api/users/:id` | DELETE | Administrador activo | Baja lógica                   |
| `/api/audit`     | GET    | Administrador activo | Últimos 50 cambios            |

El correo de acceso no se modifica desde el CRUD para evitar separar el perfil de la identidad de Auth. Los administradores crean cuentas con contraseña inicial y correo confirmado por ellos; deben verificar que el correo corresponde al titular antes de hacerlo. El registro público conserva la confirmación por correo.

## Estructura principal

- `src/app/login`, `registro`, `recuperar`, `nueva-contrasena`: acceso.
- `src/app/auth/callback`: retorno de confirmación por correo.
- `src/app/app`: aplicación protegida en la interfaz; los datos se protegen en API y RLS.
- `src/app/api`: backend Node.js.
- `src/components`: panel, formularios, sesión, marca y diálogos.
- `src/lib`: cliente Supabase, validaciones, tipos y autorización.
- `supabase/01_schema.sql`: tablas, políticas, funciones y disparadores.
- `supabase/02_primer_admin.sql`: creación controlada del primer administrador.
- `tests/security.test.mjs`: pruebas SQL con PostgreSQL embebido PGlite y contexto de Auth simulado.

## Comprobaciones realizadas

- `npm run build`: compilación y comprobación TypeScript exitosas.
- `npm test`: 11 pruebas de reglas de acceso exitosas en PGlite. Se ejecuta el SQL de instalación, se simulan los roles `anon` y `authenticated` y se comprueban intentos de escalamiento, aislamiento y auditoría.
- No se probaron correos, sesiones ni CRUD contra una instancia real de Supabase porque faltan las credenciales del proyecto.
- La revisión visual en navegador quedó pendiente: el navegador remoto no pudo acceder al servidor local. Revisar escritorio y móvil con la guía.
- Las pruebas no equivalen a una revisión de seguridad para producción. Esta es la primera entrega académica del módulo.

## Referencias de implementación

- Next.js: https://nextjs.org/docs/app/getting-started/installation
- Supabase, autenticación con contraseña: https://supabase.com/docs/guides/auth/passwords
- Supabase, seguridad por filas: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase, administración de usuarios: https://supabase.com/docs/reference/javascript/auth-admin-createuser

Paleta basada en la captura de AYNI: verde `#00a862`, azul oscuro `#0c142b`, blanco y fondos verdes claros. La maquetación usa CSS propio para que puedas modificarla sin depender de un sistema de componentes adicional.
