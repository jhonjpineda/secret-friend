# 🎁 Amigo Secreto

Sorteo de Amigo Secreto para la familia, **gratis** y sin servidores:

- **Página:** GitHub Pages (carpeta [`docs/`](docs/)).
- **Base de datos:** una Google Sheet del organizador, con el script [`apps-script/Codigo.gs`](apps-script/Codigo.gs).
- **Un link personal por persona.** Cada quien abre *su* link, pulsa **«Encuentra a tu amigo secreto»**, se barajan los nombres y aparece su amigo secreto.

## Reglas garantizadas

| Regla | Cómo se garantiza |
|---|---|
| Cada persona saca **una sola vez** | Su link tiene un código único. Al sacar, queda marcado en la hoja. Si lo abre otra vez, ve **el mismo** resultado, nunca uno nuevo. |
| Nadie puede sacar por otro ni ver lo de otros | No hay lista de nombres para elegir. Cada link solo devuelve el resultado de su dueño. Los códigos tienen 8 caracteres al azar (≈ 1 billón de combinaciones). |
| Cada persona sale **una sola vez** | Al salir queda descartada en la hoja. |
| Nadie se saca a sí mismo | Se excluye de los candidatos. |
| El sorteo **nunca se traba** | Antes de asignar se comprueba que los que faltan aún puedan terminar (evita que al último solo le quede él mismo). |
| Dos personas a la vez no chocan | El script usa un candado (`LockService`): atiende a una persona a la vez. |
| Hoja dañada a mano | Si alguien edita la hoja y rompe una regla, no se sortea nada hasta corregirla («Ver estado» dice qué pasa). |

En la hoja, el resultado se guarda como un ID (por ejemplo `P14`) en una columna oculta, así que ni el organizador lo ve sin querer.

## Configuración (organizador, una sola vez)

### 1. Preparar la Google Sheet

1. Abre tu Google Sheet (tiene que ser una **hoja de Google**, no un `.xlsx`; si es Excel: *Archivo → Guardar como Hoja de cálculo de Google*).
2. Ve a **Extensiones → Apps Script**. Borra lo que haya, pega **todo** el contenido de [`apps-script/Codigo.gs`](apps-script/Codigo.gs) y guarda (💾). Si quieres, cambia `TITULO` al inicio.
3. Vuelve a la hoja y **recárgala** (F5). Aparece el menú **🎁 Amigo Secreto** (puede tardar unos segundos).
4. **🎁 Amigo Secreto → 1. Preparar hoja**. Google pedirá permiso: *Continuar → tu cuenta → «Google no verificó esta app» → Configuración avanzada → Ir a … (no seguro) → Permitir*. Es tu propio script; el aviso es normal.
5. Pega los participantes desde la celda **B2**: nombre en la columna **B** y teléfono en la **C** (Colombia con 10 dígitos; otros países con indicativo, ej. `506…`). No pueden repetirse nombres.
6. **🎁 Amigo Secreto → 2. Generar códigos y links**.

### 2. Publicar el script como aplicación web

1. En Apps Script: **Implementar → Nueva implementación**.
2. En el engranaje ⚙️ junto a «Seleccionar tipo», elige **Aplicación web**.
3. **Ejecutar como:** *Yo*. **Quién tiene acceso:** *Cualquier persona*.
4. **Implementar** y copia la **URL de la aplicación web** (termina en `/exec`).
5. Pégala en [`docs/config.js`](docs/config.js).

> Si después cambias el código del script: *Implementar → Gestionar implementaciones → ✏️ → Versión: Nueva versión → Implementar* (la URL no cambia).

### 3. Publicar la página en GitHub Pages

1. En GitHub: **Settings → Pages → Source: Deploy from a branch → Branch: `main`, carpeta `/docs` → Save**. (Con cuenta gratis, el repositorio debe ser público; el código no tiene nombres ni teléfonos.)
2. En un minuto la página queda en `https://<usuario>.github.io/secret-friend/`.

### 4. Probar, cerrar la hoja y enviar

1. **Prueba:** abre un link de la columna «Link personal» y saca. Luego **🎁 Amigo Secreto → Reiniciar sorteo** (los links no cambian).
2. **Cierra la hoja:** *Compartir → Acceso general → Restringido*. La hoja contiene los links de todos: nadie más debe poder abrirla.
3. **Envía:** en la columna **WhatsApp**, pulsa **📲 Enviar** en cada fila; se abre WhatsApp con el mensaje y *su* link. Para quien no tiene teléfono, **📲 Elegir a quién** te deja mandárselo a un familiar.

## Durante el juego (menú 🎁 Amigo Secreto)

- **Ver estado del sorteo:** cuántos van, quién falta, y confirma que todo está en orden.
- **Anular sorteo de la fila seleccionada:** si hace falta, esa persona vuelve a sacar con el mismo link.
- **Ver resultado de la fila seleccionada:** muestra a quién le salió (spoiler).
- **Reiniciar sorteo:** borra todos los resultados; los links siguen iguales.

No borres filas ni edites a mano las columnas de ID, código o resultados mientras se juega.

## Para desarrolladores

Requiere Node.js 20 o superior. No tiene dependencias.

```bash
npm test      # prueba el script real (Codigo.gs) con una hoja simulada
npm run dev   # página local + hoja simulada en http://localhost:3000 (imprime links de prueba)
```

`npm run dev` usa `participantes.txt` si existe (una persona por línea: `Nombre<TAB>Teléfono`). Ese archivo está en `.gitignore`: los datos de la familia no se suben al repositorio.
