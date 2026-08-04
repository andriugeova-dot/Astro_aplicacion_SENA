import {
    guardarSesion,
    obtenerSesion,
    obtenerRutaPorRol,
} from "../lib/auth";

const apiUrl =
    document.documentElement.dataset.apiUrl ??
    "http://localhost:8002";

const sesionActiva = obtenerSesion();
if (sesionActiva) {
    window.location.href = obtenerRutaPorRol(sesionActiva.usuario.idRol);
}

const form = document.getElementById("form-registro") as HTMLFormElement;
const nombreInput = document.getElementById("nombre") as HTMLInputElement;
const apellidoInput = document.getElementById("apellido") as HTMLInputElement;
const correoInput = document.getElementById("correo") as HTMLInputElement;
const passwordInput = document.getElementById("password") as HTMLInputElement;
const confirmarInput = document.getElementById("confirmar") as HTMLInputElement;

const alerta = document.getElementById("alerta-registro")!;
const btnCrear = document.getElementById("btn-crear") as HTMLButtonElement;
const textoBtn = document.getElementById("texto-btn-crear")!;
const spinnerBtn = document.getElementById("spinner-btn-crear")!;

const btnVerPassword = document.getElementById("btn-ver-password")!;
const iconoVerPassword = document.getElementById("icono-ver-password")!;

// Mostrar/ocultar contraseña (aplica al campo password; si quieres que
// también afecte "confirmar", agrega el mismo toggle a ese input).
btnVerPassword.addEventListener("click", () => {
    const esPassword = passwordInput.type === "password";
    passwordInput.type = esPassword ? "text" : "password";
    iconoVerPassword.classList.toggle("bi-eye", !esPassword);
    iconoVerPassword.classList.toggle("bi-eye-slash", esPassword);
});

function mostrarError(mensaje: string) {
    alerta.textContent = mensaje;
    alerta.classList.remove("d-none");
}

function ocultarError() {
    alerta.classList.add("d-none");
}

function setCargando(cargando: boolean) {
    btnCrear.disabled = cargando;
    textoBtn.classList.toggle("d-none", cargando);
    spinnerBtn.classList.toggle("d-none", !cargando);
}

// Validación de "las contraseñas coinciden" en vivo, usando la
// Constraint Validation API (así Bootstrap muestra el invalid-feedback
// que ya tienes en el HTML, id="feedback-confirmar").
function validarConfirmacion() {
    if (confirmarInput.value !== passwordInput.value) {
        confirmarInput.setCustomValidity("Las contraseñas no coinciden.");
    } else {
        confirmarInput.setCustomValidity("");
    }
}
passwordInput.addEventListener("input", validarConfirmacion);
confirmarInput.addEventListener("input", validarConfirmacion);

form.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    ocultarError();
    validarConfirmacion();

    if (!form.checkValidity()) {
        form.classList.add("was-validated");
        return;
    }

    setCargando(true);
    try {
        const respuesta = await fetch(`${apiUrl}/registro`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                nombre: nombreInput.value.trim(),
                apellido: apellidoInput.value.trim(),
                correo: correoInput.value.trim(),
                password: passwordInput.value,
            }),
        });

        const datos = await respuesta.json();

        if (!respuesta.ok) {
            // 409 = correo ya registrado, 400 = validación del schema, etc.
            mostrarError(datos.mensaje ?? "No se pudo crear la cuenta.");
            return;
        }

        // El backend ya devuelve token + usuario en el registro exitoso,
        // así que iniciamos sesión de una vez (igual que hace login.ts).
        guardarSesion({ token: datos.token, usuario: datos.usuario });
        window.location.href = obtenerRutaPorRol(datos.usuario.idRol);
    } catch (error) {
        mostrarError("No se pudo conectar con el servidor. Intenta de nuevo.");
    } finally {
        setCargando(false);
    }
});