export type CurlHeader = { name: string; value: string };

export type ParsedCurl = {
  method: string;
  url: string;
  headers: CurlHeader[];
  body: string;
  bodyType: "none" | "raw:json" | "raw:text" | "urlencoded";
  auth:
    | { type: "none" }
    | { type: "bearer"; token: string }
    | { type: "basic"; username: string; password: string };
};

const VALUE_FLAGS = new Set([
  "--connect-timeout",
  "--max-time",
  "--output",
  "--proxy",
  "--referer",
  "--retry",
  "--user-agent",
  "-A",
  "-e",
  "-m",
  "-o",
  "-x",
]);

export function parseCurlCommand(source: string): ParsedCurl {
  const normalized = source
    .trim()
    .replace(/\\\r?\n/g, " ")
    .replace(/\^\r?\n/g, " ")
    .replace(/`\r?\n/g, " ");
  const tokens = tokenize(normalized);
  if (!tokens.length || !/^curl(?:\.exe)?$/i.test(tokens[0])) {
    throw new Error("El comando debe comenzar con curl.");
  }

  let method = "";
  let url = "";
  let basicCredentials = "";
  const headers: CurlHeader[] = [];
  const bodyParts: string[] = [];
  let bodyTypeHint: ParsedCurl["bodyType"] | null = null;

  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    const takeValue = () => {
      index += 1;
      if (index >= tokens.length)
        throw new Error(`Falta el valor de ${token}.`);
      return tokens[index];
    };

    if (token === "-X" || token === "--request")
      method = takeValue().toUpperCase();
    else if (token.startsWith("--request="))
      method = token.slice(10).toUpperCase();
    else if (/^-X.+/.test(token)) method = token.slice(2).toUpperCase();
    else if (token === "-H" || token === "--header")
      addHeader(headers, takeValue());
    else if (token.startsWith("--header=")) addHeader(headers, token.slice(9));
    else if (/^-H.+/.test(token)) addHeader(headers, token.slice(2));
    else if (
      ["-d", "--data", "--data-raw", "--data-binary", "--data-ascii"].includes(
        token,
      )
    )
      bodyParts.push(takeValue());
    else if (token.startsWith("--data=")) bodyParts.push(token.slice(7));
    else if (token === "--data-urlencode") {
      bodyParts.push(takeValue());
      bodyTypeHint = "urlencoded";
    } else if (token === "--json") {
      bodyParts.push(takeValue());
      bodyTypeHint = "raw:json";
      ensureHeader(headers, "Content-Type", "application/json");
      ensureHeader(headers, "Accept", "application/json");
    } else if (token === "-u" || token === "--user")
      basicCredentials = takeValue();
    else if (token.startsWith("--user=")) basicCredentials = token.slice(7);
    else if (token === "-b" || token === "--cookie")
      ensureHeader(headers, "Cookie", takeValue());
    else if (token === "--url") url = takeValue();
    else if (token.startsWith("--url=")) url = token.slice(6);
    else if (VALUE_FLAGS.has(token)) takeValue();
    else if (!token.startsWith("-") && !url) url = token;
  }

  if (!url) throw new Error("No se encontró una URL en el comando cURL.");
  if (!/^(https?:\/\/|\{\{)/i.test(url)) {
    throw new Error("La URL del comando debe usar HTTP o HTTPS.");
  }

  const rawBody = bodyParts.join(bodyTypeHint === "urlencoded" ? "&" : "");
  const contentType = headers
    .find((header) => header.name.toLowerCase() === "content-type")
    ?.value.toLowerCase();
  const bodyType = !rawBody
    ? "none"
    : (bodyTypeHint ??
      (contentType?.includes("json")
        ? "raw:json"
        : contentType?.includes("application/x-www-form-urlencoded")
          ? "urlencoded"
          : "raw:text"));

  const authorization = headers.find(
    (header) => header.name.toLowerCase() === "authorization",
  )?.value;
  let auth: ParsedCurl["auth"] = { type: "none" };
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    auth = { type: "bearer", token: authorization.slice(7).trim() };
  } else if (basicCredentials) {
    const separator = basicCredentials.indexOf(":");
    auth = {
      type: "basic",
      username:
        separator < 0 ? basicCredentials : basicCredentials.slice(0, separator),
      password: separator < 0 ? "" : basicCredentials.slice(separator + 1),
    };
  }

  const body =
    bodyType === "urlencoded"
      ? JSON.stringify(
          rawBody
            .split("&")
            .filter(Boolean)
            .map((part, index) => {
              const separator = part.indexOf("=");
              return {
                id: `curl-form-${index}`,
                enabled: true,
                key: decodeURIComponent(
                  separator < 0 ? part : part.slice(0, separator),
                ),
                value: decodeURIComponent(
                  separator < 0 ? "" : part.slice(separator + 1),
                ),
              };
            }),
        )
      : rawBody;

  return {
    method: (method || (rawBody ? "POST" : "GET")).toUpperCase(),
    url,
    headers,
    body,
    bodyType,
    auth,
  };
}

function addHeader(headers: CurlHeader[], source: string) {
  const separator = source.indexOf(":");
  if (separator <= 0) throw new Error(`El header "${source}" no es válido.`);
  headers.push({
    name: source.slice(0, separator).trim(),
    value: source.slice(separator + 1).trim(),
  });
}

function ensureHeader(headers: CurlHeader[], name: string, value: string) {
  if (
    !headers.some((header) => header.name.toLowerCase() === name.toLowerCase())
  ) {
    headers.push({ name, value });
  }
}

function tokenize(source: string) {
  const tokens: string[] = [];
  let token = "";
  let quote: "'" | '"' | null = null;
  let escaping = false;

  for (const character of source) {
    if (escaping) {
      token += character;
      escaping = false;
    } else if (character === "\\" && quote !== "'") {
      escaping = true;
    } else if (quote) {
      if (character === quote) quote = null;
      else token += character;
    } else if (character === "'" || character === '"') {
      quote = character;
    } else if (/\s/.test(character)) {
      if (token) {
        tokens.push(token);
        token = "";
      }
    } else token += character;
  }
  if (escaping) token += "\\";
  if (quote) throw new Error("El comando cURL contiene comillas sin cerrar.");
  if (token) tokens.push(token);
  return tokens;
}
