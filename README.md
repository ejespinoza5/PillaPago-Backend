# Backend

API para controlar comprobantes de transferencias por negocio.

Permite:

- que un dueno registre su negocio y obtenga codigo de invitacion
- que empleados se unan con ese codigo
- que los empleados suban comprobantes con imagen, monto y banco
- guardar imagenes en Supabase Storage y metadata en PostgreSQL

## Estructura

- src/: codigo fuente
- src/config/: configuraciones
- src/routes/: rutas de la API
- src/controllers/: logica de controladores
- src/services/: logica de negocio
- src/models/: modelos de datos
- src/middlewares/: middlewares
- src/utils/: utilidades
- tests/: pruebas
- docs/: documentacion

## Comenzar

1. Instala dependencias:
   npm install
2. Configura variables en .env (usa .env.example como referencia)
3. Crea tablas en PostgreSQL:
   npm run db:init
4. Verifica conexion a PostgreSQL:
   npm run db:check
5. Ejecuta la app:
   npm start

## Variables de entorno

- PORT=3000
- NODE_ENV=development
- DATABASE_URL=postgresql://...
- GOOGLE_CLIENT_ID=tu_google_client_id.apps.googleusercontent.com
- JWT_SECRET=secreto_para_firmar_tokens
- SUPABASE_URL=https://tu-proyecto.supabase.co
- SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
- SUPABASE_STORAGE_BUCKET=imagenes

## Endpoints

### Salud

- GET /health
- GET /api/health

### Negocios

- GET /api/negocios
- GET /api/negocios/:id
- POST /api/negocios
- POST /api/negocios/register-owner (Bearer token)
- POST /api/negocios/join (Bearer token)

Body ejemplo POST /api/negocios:

{
   "nombre_negocio": "Tienda Central"
}

El codigo de invitacion siempre se genera automaticamente.

Body ejemplo POST /api/negocios/register-owner:

{
   "nombre_negocio": "Mi Tienda"
}

Body ejemplo POST /api/negocios/join:

{
   "codigo_invitacion": "INVITA123"
}

### Usuarios

- GET /api/usuarios
- GET /api/usuarios?id_negocio=1
- GET /api/usuarios/me (Bearer token)
- PATCH /api/usuarios/me/perfil (Bearer token, multipart/form-data)
- GET /api/usuarios/:id
- POST /api/usuarios
- PATCH /api/usuarios/:id

Body ejemplo POST /api/usuarios:

{
   "nombre": "Ana",
   "email": "ana@correo.com",
   "rol": "pendiente",
   "id_negocio": 1
}

Body ejemplo PATCH /api/usuarios/me/perfil:

Campos form-data:

- nombre: Ana Maria (opcional)
- foto_perfil: archivo imagen (opcional)

Reglas:

- Debes enviar al menos uno: nombre o foto_perfil.
- Si envias foto_perfil, se sube a Supabase y se guarda la URL publica en el usuario autenticado.

### Autenticacion Google

- POST /api/auth/google
- POST /api/auth/email/register (multipart/form-data)
- POST /api/auth/email/register-owner (multipart/form-data)
- POST /api/auth/email/register-employee (multipart/form-data)
- POST /api/auth/email/login
- POST /api/auth/email/verify/request (requiere token Bearer)
- POST /api/auth/email/verify/confirm (requiere token Bearer)
- POST /api/auth/email/change/request (requiere token Bearer)
- POST /api/auth/email/change/confirm (requiere token Bearer)
- GET /api/auth/me (requiere token Bearer)
- PATCH /api/auth/password (requiere token Bearer)

Body ejemplo POST /api/auth/google:

{
   "idToken": "token_de_google_desde_frontend"
}

Respuesta:

{
   "token": "jwt_del_backend",
   "usuario": {
      "id_usuario": 1,
      "nombre": "Ana",
      "email": "ana@correo.com",
      "rol": "empleado",
      "id_negocio": 1
   }
   ,
   "onboarding_required": true
}

Flujo Google por etapas:

- Paso 1: Login Google crea/actualiza usuario con datos esenciales.
- Paso 2: Si onboarding_required es true, el frontend debe mostrar opcion:
  - crear negocio como dueno: POST /api/negocios/register-owner (Bearer)
  - unirse como empleado: POST /api/negocios/join (Bearer)

Usa el token asi:

Authorization: Bearer TU_JWT

Body ejemplo POST /api/auth/email/register:

Campos form-data:

- nombre: Ana
- email: ana@correo.com
- password: Abcde1@
- nombre_negocio: Mi Tienda (opcional, para registrar dueno)
- codigo_invitacion: INVITA123 (opcional, para registrar empleado)
- foto_perfil: archivo imagen (opcional, se guarda en Supabase)

Reglas:

- Si envias nombre_negocio, se crea el negocio y el usuario queda como dueno.
- El codigo de negocio se genera automaticamente.
- Si envias codigo_invitacion, el usuario se registra como empleado dentro de ese negocio.
- No envies nombre_negocio y codigo_invitacion al mismo tiempo.

Flujo recomendado:

- Dueno: usa /api/auth/email/register-owner y envia nombre_negocio.
- Empleado: usa /api/auth/email/register-employee y envia codigo_invitacion.

Body ejemplo POST /api/auth/email/login:

{
   "email": "ana@correo.com",
   "password": "Abcde1@"
}

Respuesta incluye en usuario:

- email_verificado: true | false

Body ejemplo PATCH /api/auth/password:

{
   "password_actual": "Abcde1@",
   "password_nueva": "Nueva1@"
}

Tambien puedes enviar:

{
   "contrasena_anterior": "Abcde1@",
   "contrasena_nueva": "Nueva1@"
}

Reglas de validacion de correo y contrasena:

- email debe tener formato valido (ejemplo: usuario@dominio.com).
- password y contrasena_nueva deben cumplir:
  - minimo 6 caracteres
  - minimo 1 mayuscula
  - minimo 1 numero
  - minimo 1 caracter especial

Body ejemplo POST /api/auth/email/change/request:

{
   "new_email": "nuevo_correo@correo.com"
}

Body ejemplo POST /api/auth/email/verify/request:

{}

Body ejemplo POST /api/auth/email/verify/confirm:

{
   "code": "903830"
}

Body ejemplo POST /api/auth/email/change/confirm:

{
   "new_email": "nuevo_correo@correo.com",
   "code": "903830"
}

Flujo de cambio de correo:

- Primero llamas /api/auth/email/change/request con el nuevo correo.
- El backend envia un codigo de 6 digitos al nuevo correo.
- Luego llamas /api/auth/email/change/confirm con new_email y code para confirmar.

### Transferencias

- GET /api/transferencias (Bearer token)
- POST /api/transferencias (Bearer token, multipart/form-data)

POST /api/transferencias campos:

- imagen: archivo de imagen
- monto: numero positivo
- banco: texto

Ejemplo cURL:

curl -X POST http://localhost:3000/api/transferencias \
   -H "Authorization: Bearer TU_JWT" \
   -F "imagen=@C:/ruta/comprobante.jpg" \
   -F "monto=25000" \
   -F "banco=Bancolombia"

Notas de acceso:

- dueno ve todas las transferencias de su negocio
- empleado ve solo sus transferencias

### Empleados

- GET /api/empleados (Bearer token, solo dueno)
- GET /api/empleados/inactivos (Bearer token, solo dueno)
- GET /api/empleados/:id (Bearer token, solo dueno)
- PATCH /api/empleados/:id/reactivar (Bearer token, solo dueno)
- DELETE /api/empleados/:id (Bearer token, solo dueno)
- DELETE /api/empleados/me/salir-negocio (Bearer token, dueno o empleado)

Body ejemplo DELETE /api/empleados/me/salir-negocio:

{}

Reglas:

- El empleado puede salir de su negocio en cualquier momento.
- El dueno solo puede salir si no tiene empleados activos en su negocio.
- Al salir, el usuario queda con rol pendiente y sin id_negocio.
