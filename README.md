# Flota & Equipos — App de gestión

App web mobile-first para gestión de flota y maquinaria, conectada a Google Sheets.

## Archivos
- `index.html` — estructura de la app
- `style.css` — estilos (tema oscuro, mobile-first)
- `app.js` — lógica principal y conexión a Google Sheets API
- `config.js` — **aquí van tu API Key y Sheet ID**
- `manifest.json` — permite instalar la app en el celular

## Configuración rápida

1. Abre `config.js` y verifica que tu API Key y Sheet ID estén correctos
2. Asegúrate que tu Google Sheet esté compartido como "Cualquier persona con el enlace - Lector"
3. Sube los 5 archivos a GitHub Pages (ver instrucciones abajo)

## Subir a GitHub Pages

1. Crea cuenta en [github.com](https://github.com) si no tienes
2. Haz clic en **"New repository"**
3. Nómbralo `flota-equipos`, márcalo como **Public**
4. Sube los 5 archivos (drag & drop en la interfaz web de GitHub)
5. Ve a **Settings → Pages → Source: Deploy from branch → main / (root)**
6. En 1-2 minutos tu app estará en `https://tuusuario.github.io/flota-equipos`

## Instalar en el celular (Android)

1. Abre la URL en Chrome
2. Menú (⋮) → "Agregar a pantalla de inicio"
3. Se instala como app nativa

## Instalar en iPhone

1. Abre la URL en Safari
2. Botón compartir (□↑) → "Agregar a pantalla de inicio"

## Para poder ESCRIBIR en el Sheet (editar equipos y registrar mantenciones)

La API Key de Google solo permite **leer** datos públicos.
Para escribir necesitas agregar autenticación OAuth 2.0.

Opciones:
- **Opción A (fácil)**: Usar Google Apps Script como intermediario (gratis, sin servidor)
- **Opción B**: Configurar OAuth en Google Cloud Console

Si quieres activar escritura, avísame y te genero la configuración adicional.

## Pestañas del Google Sheet esperadas

La app lee la hoja **"VEHICULOS Y MAQUINARIAS"** con estas columnas:
- A: N°
- B: EQUIPO
- C: CODIGO
- D: MARCA
- E: MODELO
- F: AÑO
- G: COLOR
- H: PATENTE
- I: ESTADO OPERATIVO
- J: UBICACIÓN ACTUAL
- K: HORÓMETRO / ODÓMETRO
- L: PRÓXIMA MANTENCIÓN
- M: ULTIMA MANTENCIÓN
- N: SOAP (fecha vencimiento)
- O: PERMISO CIRCULACIÓN (fecha vencimiento)
- P: REVISIÓN TÉCNICA (fecha vencimiento)
- S: OBSERVACIONES GENERALES
- T: MANTENCION CADA
- U: PROPIETARIO
- V: RUT
