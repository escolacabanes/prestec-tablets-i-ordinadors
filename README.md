# Reserva de tablets

Aplicación web para gestionar el préstamo de las 25 tablets del centro entre las 8 clases.
Es una web estática (HTML + JS, sin compilación) que se publica en **GitHub Pages** y guarda los datos en **Firebase Firestore**.

## Qué hace

- **Calendario a 2 semanas** (se puede avanzar semana a semana) con las 6 sesiones diarias y el patio marcado.
  Cada casilla muestra cuántas tablets hay libres y quién tiene las ocupadas.
- **Reservas puntuales** (una sesión concreta) o **fijas** ("cada martes en la 3ª sesión, hasta que la anule").
  Una reserva fija se puede anular un solo día o a partir de un día.
- **Préstamo entre clases:** cualquier persona puede reservar tablets libres de otra clase con un máximo de 14 días de antelación.
  Al tutor/a propietario le aparece un aviso para aceptar o rechazar; si no contesta, se da por aceptado.
  Si lo rechaza, esas tablets se quitan de la reserva y quien las pidió recibe un aviso.
- Las reservas fijas solo se pueden hacer con las tablets de la clase propia (el administrador puede hacerlas con cualquiera).
- La tablet 31 es de uso común.
- **Incidencias:** cualquier persona puede comunicar una incidencia de una tablet; el administrador las ve con un contador y las marca como resueltas.
  Las tablets con incidencias abiertas aparecen marcadas con ⚠ al reservar.
- **Administración:** gestionar personas (tutores, especialistas, admins), días no lectivos y descargar una copia de seguridad en JSON.

No hay contraseñas: cada persona elige su nombre la primera vez y la app lo recuerda en ese dispositivo.

## Configuración (solo la primera vez)

1. **Firebase** (https://console.firebase.google.com):
   1. Crear un proyecto nuevo (o usar uno existente).
   2. *Build → Firestore Database → Crear base de datos* (ubicación `eur3` o `europe-west`), en modo producción.
   3. *Build → Authentication → Comenzar → Sign-in method* → activar **Anónimo**.
   4. *Firestore → Reglas*: pegar el contenido de `firestore.rules` y publicar.
   5. *Configuración del proyecto → Tus apps → Web (`</>`)*: registrar la app y copiar el objeto `firebaseConfig` en `firebase-config.js`.
2. **GitHub**:
   1. Crear un repositorio y subir todos los archivos.
   2. *Settings → Pages → Deploy from a branch → main / root*.
   3. En Firebase, *Authentication → Settings → Authorized domains*, añadir `TU_USUARIO.github.io`.
3. Abrir la web, elegir **Isaac (administrador)** y en *Administració* cambiar los nombres de tutores y especialistas y añadir los días festivos.

Mientras `firebase-config.js` esté vacío, la app funciona en **modo demo** (los datos solo se guardan en ese navegador).

## Probar en local

```bash
node dev-server.mjs
```

Y abrir http://localhost:5173

## Cambiar clases, tablets o sesiones

Todo está al principio de `app.js` (`CLASSES` y `SESSIONS`).
