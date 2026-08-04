// src/scripts/agGridCrud.ts
//
// Motor genérico de CRUD sobre AgGrid, reutilizado por todas las páginas
// /admin/* (usuarios, fichas, programas, asignaturas, horarios, roles).
//
// Cada página solo declara su configuración (endpoint, columnas, campos del
// formulario) y llama a `iniciarCRUD(config)`; toda la lógica de carga,
// creación, edición, borrado y exportación vive aquí una sola vez.

import { fetchAutenticado, NOMBRES_ROL } from "../lib/auth";

// AgGrid se carga desde CDN como script clásico (ver AdminTablaCRUD.astro),
// así que se expone como `window.agGrid`. No hay paquete npm confiable
// instalado en este proyecto (ver nota en el README de admin).
declare global {
  interface Window {
    agGrid: {
      createGrid: (
        contenedor: HTMLElement,
        // deno-lint-ignore no-explicit-any
        opciones: any,
        // deno-lint-ignore no-explicit-any
      ) => any;
    };
  }
}

const API_URL = import.meta.env.PUBLIC_API_URL ?? "http://localhost:8002";

export type TipoCampo =
  | "text"
  | "email"
  | "password"
  | "number"
  | "select"
  | "textarea"
  | "time";

export interface OpcionSelect {
  value: string | number;
  label: string;
}

export interface FuenteRemota {
  /** Ruta relativa a la API, ej. "/programa" */
  endpoint: string;
  /** Campo que se usa como value del <option>, ej. "idPrograma" */
  valueField: string;
  /** Campo que se muestra como texto del <option>, ej. "nombrePrograma" */
  labelField: string;
}

export interface CampoFormulario {
  field: string;
  label: string;
  type: TipoCampo;
  required?: boolean;
  opciones?: OpcionSelect[];
  fuenteRemota?: FuenteRemota;
  ayuda?: string;
}

export interface ColumnaGrid {
  field: string;
  headerName: string;
  minWidth?: number;
}

export interface ConfigCRUD {
  contenedorId: string;
  endpoint: string;
  idField: string;
  entidadSingular: string;
  columnas: ColumnaGrid[];
  camposFormulario: CampoFormulario[];
}

// deno-lint-ignore no-explicit-any
let gridApi: any = null;
let configActual: ConfigCRUD;
let modoEdicion: number | string | null = null;
let opcionesRemotasCache: Record<string, OpcionSelect[]> = {};

function el<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function mostrarAlerta(mensaje: string, tipo: "success" | "danger" = "danger") {
  const alerta = el<HTMLDivElement>("alerta-tabla");
  if (!alerta) return;
  alerta.textContent = mensaje;
  alerta.className = `alerta-tabla alerta-${tipo}`;
  window.setTimeout(() => alerta.classList.add("d-none"), 4000);
}

/** Formatea valores especiales conocidos (por ahora, idRol -> nombre legible). */
// deno-lint-ignore no-explicit-any
function formatearValor(field: string, valor: any): string {
  if (valor === null || valor === undefined) return "";
  if (field === "idRol" && valor in NOMBRES_ROL) {
    return `${valor} - ${NOMBRES_ROL[Number(valor)]}`;
  }
  return String(valor);
}

async function cargarDatos() {
  try {
    const respuesta = await fetchAutenticado(`${API_URL}${configActual.endpoint}`);
    if (!respuesta.ok) {
      mostrarAlerta("No se pudieron cargar los datos. Verifica tu sesión e inténtalo de nuevo.");
      return;
    }
    const datos = await respuesta.json();
    gridApi.setGridOption("rowData", Array.isArray(datos) ? datos : []);
  } catch (_error) {
    mostrarAlerta("No se pudo conectar con el servidor. Verifica que la API esté corriendo.");
  }
}

async function cargarOpcionesRemotas() {
  for (const campo of configActual.camposFormulario) {
    const fuente = campo.fuenteRemota;
    if (!fuente) continue;
    try {
      const respuesta = await fetchAutenticado(`${API_URL}${fuente.endpoint}`);
      if (!respuesta.ok) continue;
      const datos = await respuesta.json();
      // deno-lint-ignore no-explicit-any
      opcionesRemotasCache[campo.field] = (Array.isArray(datos) ? datos : []).map((item: any) => ({
        value: item[fuente.valueField],
        label: `${item[fuente.valueField]} - ${item[fuente.labelField]}`,
      }));
    } catch {
      // Sin conexión: el select queda vacío; el usuario puede reabrir el modal luego.
    }
  }
}

function construirColumnas() {
  // deno-lint-ignore no-explicit-any
  const columnasGrid: any[] = configActual.columnas.map((columna) => ({
    field: columna.field,
    headerName: columna.headerName,
    minWidth: columna.minWidth ?? 130,
    // deno-lint-ignore no-explicit-any
    valueFormatter: (params: any) => formatearValor(columna.field, params.value),
  }));

  columnasGrid.push({
    field: "__acciones",
    headerName: "Acciones",
    editable: false,
    filter: false,
    sortable: false,
    enableRowGroup: false,
    enableValue: false,
    minWidth: 120,
    pinned: "right",
    // deno-lint-ignore no-explicit-any
    cellRenderer: (params: any) => {
      const contenedor = document.createElement("div");
      contenedor.className = "acciones-celda";

      const btnEditar = document.createElement("button");
      btnEditar.type = "button";
      btnEditar.className = "btn-accion btn-editar";
      btnEditar.title = "Editar";
      btnEditar.innerHTML = '<i class="bi bi-pencil-fill"></i>';
      btnEditar.addEventListener("click", () => abrirModal(params.data));

      const btnEliminar = document.createElement("button");
      btnEliminar.type = "button";
      btnEliminar.className = "btn-accion btn-eliminar";
      btnEliminar.title = "Eliminar";
      btnEliminar.innerHTML = '<i class="bi bi-trash-fill"></i>';
      btnEliminar.addEventListener("click", () => eliminarRegistro(params.data));

      contenedor.append(btnEditar, btnEliminar);
      return contenedor;
    },
  });

  return columnasGrid;
}

// deno-lint-ignore no-explicit-any
function abrirModal(data: any | null) {
  modoEdicion = data ? data[configActual.idField] : null;

  const titulo = el<HTMLHeadingElement>("modal-titulo");
  if (titulo) {
    titulo.textContent = data ? `Editar ${configActual.entidadSingular}` : `Nuevo ${configActual.entidadSingular}`;
  }

  const contenedorCampos = el<HTMLDivElement>("campos-formulario");
  if (!contenedorCampos) return;
  contenedorCampos.innerHTML = "";

  configActual.camposFormulario.forEach((campo) => {
    const label = document.createElement("label");
    label.className = "campo-form";

    const span = document.createElement("span");
    span.textContent = campo.label + (campo.required ? " *" : "");
    label.appendChild(span);

    let input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

    if (campo.type === "select") {
      const select = document.createElement("select");
      const opciones = campo.fuenteRemota ? (opcionesRemotasCache[campo.field] ?? []) : (campo.opciones ?? []);

      const vacio = document.createElement("option");
      vacio.value = "";
      vacio.textContent = "Selecciona una opción";
      select.appendChild(vacio);

      opciones.forEach((opcion) => {
        const option = document.createElement("option");
        option.value = String(opcion.value);
        option.textContent = opcion.label;
        select.appendChild(option);
      });

      input = select;
    } else if (campo.type === "textarea") {
      const textarea = document.createElement("textarea");
      textarea.rows = 3;
      input = textarea;
    } else {
      const nativeInput = document.createElement("input");
      nativeInput.type = campo.type;
      if (campo.type === "number") nativeInput.step = "1";
      input = nativeInput;
    }

    input.name = campo.field;
    input.id = `campo-${campo.field}`;
    input.required = Boolean(campo.required);

    if (data && data[campo.field] !== null && data[campo.field] !== undefined) {
      input.value = String(data[campo.field]);
    }

    // La contraseña nunca vuelve del backend (se oculta a propósito); en
    // edición se deja vacía y opcional: solo se envía si el usuario la llena.
    if (campo.field === "password" && data) {
      (input as HTMLInputElement).placeholder = "Dejar en blanco para no cambiarla";
      input.required = false;
    }

    label.appendChild(input);

    if (campo.ayuda) {
      const ayuda = document.createElement("small");
      ayuda.className = "campo-ayuda";
      ayuda.textContent = campo.ayuda;
      label.appendChild(ayuda);
    }

    contenedorCampos.appendChild(label);
  });

  el<HTMLDivElement>("error-formulario")?.classList.add("d-none");
  el<HTMLDivElement>("modal-overlay")?.classList.remove("d-none");
}

function cerrarModal() {
  el<HTMLDivElement>("modal-overlay")?.classList.add("d-none");
  modoEdicion = null;
}

async function manejarSubmit(evento: SubmitEvent) {
  evento.preventDefault();

  const datos: Record<string, unknown> = {};

  for (const campo of configActual.camposFormulario) {
    const input = el<HTMLInputElement>(`campo-${campo.field}`);
    if (!input) continue;
    const valorCrudo = input.value.trim();

    // Editar sin tocar la contraseña: no se manda el campo.
    if (campo.field === "password" && modoEdicion && valorCrudo === "") continue;

    if (valorCrudo === "") {
      if (campo.required) {
        mostrarErrorFormulario(`El campo "${campo.label}" es obligatorio.`);
        return;
      }
      continue;
    }

    // Los <select> de llave foránea (fuenteRemota, ej. idPrograma/idRol)
    // guardan IDs numéricos; los <select> estáticos (jornada, diaSemana)
    // son texto y deben viajar tal cual.
    const esNumerico = campo.type === "number" || (campo.type === "select" && Boolean(campo.fuenteRemota));
    datos[campo.field] = esNumerico ? Number(valorCrudo) : valorCrudo;
  }

  try {
    const url = modoEdicion
      ? `${API_URL}${configActual.endpoint}/${modoEdicion}`
      : `${API_URL}${configActual.endpoint}`;
    const metodo = modoEdicion ? "PUT" : "POST";

    const respuesta = await fetchAutenticado(url, {
      method: metodo,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos),
    });

    const cuerpo = await respuesta.json().catch(() => ({}));

    if (!respuesta.ok) {
      mostrarErrorFormulario(cuerpo?.mensaje ?? "No se pudo guardar el registro.");
      return;
    }

    mostrarAlerta(cuerpo?.mensaje ?? "Registro guardado correctamente.", "success");
    cerrarModal();
    await cargarDatos();
  } catch (_error) {
    mostrarErrorFormulario("No se pudo conectar con el servidor.");
  }
}

function mostrarErrorFormulario(mensaje: string) {
  const errorEl = el<HTMLDivElement>("error-formulario");
  if (!errorEl) return;
  errorEl.textContent = mensaje;
  errorEl.classList.remove("d-none");
}

// deno-lint-ignore no-explicit-any
async function eliminarRegistro(data: any) {
  const id = data[configActual.idField];
  const confirmado = window.confirm(
    `¿Eliminar este ${configActual.entidadSingular.toLowerCase()}? Esta acción no se puede deshacer.`,
  );
  if (!confirmado) return;

  try {
    const respuesta = await fetchAutenticado(`${API_URL}${configActual.endpoint}/${id}`, {
      method: "DELETE",
    });
    const cuerpo = await respuesta.json().catch(() => ({}));

    if (!respuesta.ok) {
      mostrarAlerta(cuerpo?.mensaje ?? "No se pudo eliminar el registro.");
      return;
    }

    mostrarAlerta(cuerpo?.mensaje ?? "Registro eliminado correctamente.", "success");
    await cargarDatos();
  } catch (_error) {
    mostrarAlerta("No se pudo conectar con el servidor.");
  }
}

function exportarCSV() {
  gridApi?.exportDataAsCsv({ fileName: `${configActual.entidadSingular.toLowerCase()}.csv` });
}

function exportarExcel() {
  if (gridApi && typeof gridApi.exportDataAsExcel === "function") {
    gridApi.exportDataAsExcel({ fileName: `${configActual.entidadSingular.toLowerCase()}.xlsx` });
  } else {
    mostrarAlerta("La exportación a Excel requiere el módulo ag-grid-enterprise (no se pudo cargar).");
  }
}

export async function iniciarCRUD(config: ConfigCRUD) {
  configActual = config;
  opcionesRemotasCache = {};
  modoEdicion = null;

  const contenedor = el<HTMLDivElement>(config.contenedorId);
  if (!contenedor || !window.agGrid) {
    mostrarAlerta("No se pudo inicializar la tabla (AgGrid no se cargó).");
    return;
  }

  await cargarOpcionesRemotas();

  // deno-lint-ignore no-explicit-any
  const gridOptions: any = {
    columnDefs: construirColumnas(),
    rowData: [],
    defaultColDef: {
      flex: 1,
      filter: true,
      floatingFilter: true,
      sortable: true,
      resizable: true,
      enableRowGroup: true,
      enableValue: true,
      minWidth: 120,
    },
    statusBar: {
      statusPanels: [
        { statusPanel: "agTotalRowCountComponent", align: "left" },
        { statusPanel: "agFilteredRowCountComponent", align: "left" },
        { statusPanel: "agAggregationComponent", align: "right" },
      ],
    },
    sideBar: {
      toolPanels: [
        {
          id: "columns",
          labelDefault: "Columnas",
          labelKey: "columns",
          iconKey: "columns",
          toolPanel: "agColumnsToolPanel",
        },
        {
          id: "filters",
          labelDefault: "Filtros",
          labelKey: "filters",
          iconKey: "filter",
          toolPanel: "agFiltersToolPanel",
        },
      ],
      defaultToolPanel: "",
    },
    enableRangeSelection: true,
    animateRows: true,
    pagination: true,
    paginationPageSize: 20,
    onGridReady: () => cargarDatos(),
  };

  gridApi = window.agGrid.createGrid(contenedor, gridOptions);

  el<HTMLButtonElement>("btn-nuevo")?.addEventListener("click", () => abrirModal(null));
  el<HTMLButtonElement>("btn-cerrar-modal")?.addEventListener("click", cerrarModal);
  el<HTMLButtonElement>("btn-cancelar")?.addEventListener("click", cerrarModal);
  el<HTMLDivElement>("modal-overlay")?.addEventListener("click", (evento) => {
    if (evento.target === el<HTMLDivElement>("modal-overlay")) cerrarModal();
  });
  el<HTMLFormElement>("form-crud")?.addEventListener("submit", manejarSubmit);
  el<HTMLButtonElement>("btn-exportar-csv")?.addEventListener("click", exportarCSV);
  el<HTMLButtonElement>("btn-exportar-excel")?.addEventListener("click", exportarExcel);
}
