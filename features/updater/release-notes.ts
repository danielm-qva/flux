export type ReleaseNotes = {
  version: string;
  title: string;
  summary: string;
  changes: string[];
};

export const RELEASE_NOTES: Record<string, ReleaseNotes> = {
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
