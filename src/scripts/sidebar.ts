import { cerrarSesion } from "../lib/auth";

const boton = document.getElementById("btn-cerrar-sesion");

boton?.addEventListener("click", () => {

    const confirmar = confirm("¿Deseas cerrar sesión?");

    if (!confirmar) return;

    cerrarSesion();

    window.location.href = "/login";
});