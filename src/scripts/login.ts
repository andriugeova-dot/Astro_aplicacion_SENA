// src/scripts/login.ts
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

const form = document.getElementById("form-login") as HTMLFormElement;
const correoInput = document.getElementById("correo") as HTMLInputElement;
const passwordInput = document.getElementById("password") as HTMLInputElement;

const alerta = document.getElementById("alerta-login")!;
const btnEntrar = document.getElementById("btn-entrar") as HTMLButtonElement;
const textoBtn = document.getElementById("texto-btn-entrar")!;
const spinnerBtn = document.getElementById("spinner-btn-entrar")!;

const btnVerPassword = document.getElementById("btn-ver-password")!;
const iconoVerPassword = document.getElementById("icono-ver-password")!;

// Mostrar/ocultar contraseña
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
    btnEntrar.disabled = cargando;
    textoBtn.classList.toggle("d-none", cargando);
    spinnerBtn.classList.toggle("d-none", !cargando);
}

form.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    ocultarError();

    if (!form.checkValidity()) {
        form.classList.add("was-validated");
        return;
    }

    setCargando(true);
    try {
        const respuesta = await fetch(`${apiUrl}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                correo: correoInput.value.trim(),
                password: passwordInput.value,
            }),
        });

        const datos = await respuesta.json();

        if (!respuesta.ok) {
            mostrarError(datos.mensaje ?? "Correo o contraseña incorrectos");
            return;
        }

        guardarSesion({ token: datos.token, usuario: datos.usuario });
        window.location.href = obtenerRutaPorRol(datos.usuario.idRol);
    } catch (error) {
        mostrarError("No se pudo conectar con el servidor. Intenta de nuevo.");
    } finally {
        setCargando(false);
    }
});