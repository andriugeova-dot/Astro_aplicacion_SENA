// src/lib/auth.ts
//
// Utilidades de sesión para el frontend. El backend (server_asistencias)
// entrega un JWT en /login y /registro; aquí lo guardamos en localStorage
// junto con los datos del usuario (sin password) para no tener que
// decodificar el token cada vez que necesitemos idRol, nombre, etc.
//
// Import: `import { guardarSesion, obtenerSesion, cerrarSesion, ... } from "../lib/auth"`

export interface Usuario {
  idUsuario: number;
  nombre: string;
  apellido: string;
  correo: string;
  idRol: number;
}

export interface Sesion {
  token: string;
  usuario: Usuario;
}

const STORAGE_KEY = "asistencias_sesion";

// Nombres legibles para cada rol, según el volcado de la tabla `rol`
// (1 = aprendiz, 2 = instructor, 3 = admin).
export const NOMBRES_ROL: Record<number, string> = {
  1: "Aprendiz",
  2: "Instructor",
  3: "Administrador",
};

// A dónde debe ir cada rol justo después de iniciar sesión
// (1 = aprendiz, 2 = instructor, 3 = admin).
export const RUTA_POR_ROL: Record<number, string> = {
  1: "/usuario",
  2: "/instructor",
  3: "/dashboard",
};

/** Ruta del panel que le corresponde a un rol. Cae a /dashboard si el rol no está mapeado. */
export function obtenerRutaPorRol(idRol: number): string {
  return RUTA_POR_ROL[idRol] ?? "/dashboard";
}

/** Guarda el token + usuario devueltos por /login o /registro. */
export function guardarSesion(sesion: Sesion): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sesion));
}

/** Lee la sesión activa, o null si no hay ninguna (o está corrupta). */
export function obtenerSesion(): Sesion | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const sesion = JSON.parse(raw) as Sesion;
    if (!sesion?.token || !sesion?.usuario) return null;
    return sesion;
  } catch {
    return null;
  }
}

/** Elimina la sesión guardada (logout). */
export function cerrarSesion(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** true si hay un token guardado. No valida contra el servidor si expiró. */
export function haySesionActiva(): boolean {
  return obtenerSesion() !== null;
}

/**
 * Redirige a /login si no hay sesión. Pensada para llamarse al cargar
 * cualquier página que requiera estar autenticado.
 * Devuelve la sesión si existe, o null (y ya disparó el redirect) si no.
 */
export function exigirSesion(): Sesion | null {
  const sesion = obtenerSesion();
  if (!sesion) {
    window.location.href = "/login";
    return null;
  }
  return sesion;
}

/**
 * Exige sesión activa Y que el rol esté en `rolesPermitidos`.
 * - Sin sesión -> redirige a /login.
 * - Con sesión pero rol incorrecto -> redirige al panel que sí le corresponde.
 * Devuelve la sesión si todo está en orden, o null (y ya disparó el redirect).
 */
export function exigirRol(rolesPermitidos: number[]): Sesion | null {
  const sesion = exigirSesion();
  if (!sesion) return null;

  if (!rolesPermitidos.includes(sesion.usuario.idRol)) {
    window.location.href = obtenerRutaPorRol(sesion.usuario.idRol);
    return null;
  }
  return sesion;
}

/**
 * fetch() con el header Authorization: Bearer <token> ya puesto.
 * Si el servidor responde 401 (token inválido o expirado), limpia la
 * sesión y manda al usuario de vuelta a /login.
 */
export async function fetchAutenticado(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const sesion = obtenerSesion();
  const headers = new Headers(init.headers);
  if (sesion?.token) {
    headers.set("Authorization", `Bearer ${sesion.token}`);
  }

  const respuesta = await fetch(input, { ...init, headers });

  if (respuesta.status === 401) {
    cerrarSesion();
    window.location.href = "/login";
  }

  return respuesta;
}
