export type ReleaseNotes = {
  version: string;
  title: string;
  summary: string;
  changes: string[];
};

export const RELEASE_NOTES: Record<string, ReleaseNotes> = {
  "3.7.0": {
    version: "3.7.0",
    title: "Una nueva identidad para Flux",
    summary: "Temas Día y Noche, acento naranja y una interfaz renovada para trabajar con tus APIs.",
    changes: [
      "Navegación lateral y petición y respuesta en paralelo.",
      "Editores de cuerpo y autorización, entornos, Flow y búsqueda renovados.",
      "Historial completo con filtros, estados y duración sin recortes.",
      "Selectores y menús coherentes entre sistemas, con navegación por teclado.",
      "Preferencias de código y tiempo de espera, y sugerencias para errores 401 y 415.",
      "Bienvenida, notificaciones e iconos adaptados a la nueva identidad.",
    ],
  },
  "2.0.0": {
    version: "2.0.0",
    title: "Workspaces más flexibles",
    summary:
      "Flux 2.0 mejora la organización de tus APIs y conserva el contexto de cada ejecución.",
    changes: [
      "Envía peticiones con o sin un environment activo.",
      "Organiza peticiones en carpetas y subcarpetas.",
      "Mueve, duplica, renombra y elimina peticiones desde el sidebar.",
      "Consulta un historial persistente con status, duración, tamaño y respuesta.",
      "Guarda e importa cURL desde la cabecera del editor.",
      "Disfruta de un sidebar más amplio y una navegación más clara.",
    ],
  },
};
