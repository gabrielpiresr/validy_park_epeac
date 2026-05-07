export type TechnextTicket = {
  n_ticket: string;
  tp_ticket: string;
  placa: string;
  dt_entrada: string;
  tolerancia: string;
  usuario: string;
  status: string;
  [key: string]: unknown;
};

type AuthResponse = { token: string };

const env = {
  baseUrl: process.env.TECHNEXT_BASE_URL,
  seedToken: process.env.TECHNEXT_TOKEN,
  username: process.env.TECHNEXT_USERNAME,
  password: process.env.TECHNEXT_PASSWORD
};

let runtimeToken: string | null = env.seedToken ?? null;

function assertEnv() {
  const missing: string[] = [];
  if (!env.baseUrl) missing.push("TECHNEXT_BASE_URL");
  if (!env.username) missing.push("TECHNEXT_USERNAME");
  if (!env.password) missing.push("TECHNEXT_PASSWORD");

  if (missing.length > 0) {
    throw new Error(`Variáveis de ambiente ausentes: ${missing.join(", ")}`);
  }
}

function buildUrl(path: string) {
  const base = (env.baseUrl ?? "").replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

function sanitizeTicketForLog(ticket: Partial<TechnextTicket>) {
  return {
    n_ticket: ticket.n_ticket,
    placa: ticket.placa,
    dt_entrada: ticket.dt_entrada,
    tolerancia: ticket.tolerancia,
    status: ticket.status
  };
}

async function readResponseBodySafe(response: Response) {
  try {
    const text = await response.clone().text();
    return text.slice(0, 500);
  } catch {
    return "<body indisponível>";
  }
}

async function authenticate(): Promise<string> {
  if (!env.baseUrl || !env.username || !env.password) {
    throw new Error("Configuração de autenticação incompleta da Technext.");
  }

  console.info("[technext] Iniciando autenticação na Technext.");
  const res = await fetch(buildUrl("/api-token-auth/"), {
    method: "POST",
    headers: {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ username: env.username, password: env.password }),
    cache: "no-store"
  });

  if (!res.ok) {
    const body = await readResponseBodySafe(res);
    console.error("[technext] Falha na autenticação.", { status: res.status, body });
    throw new Error(`Falha ao autenticar na Technext (${res.status})`);
  }

  const data = (await res.json()) as AuthResponse;
  if (!data.token) throw new Error("Token inválido retornado pela Technext.");
  runtimeToken = data.token;
  console.info("[technext] Autenticação concluída com sucesso.");
  return data.token;
}

async function getToken() {
  if (runtimeToken) return runtimeToken;
  return authenticate();
}

async function technextRequest(path: string, init: RequestInit = {}, attempt = 0): Promise<Response> {
  assertEnv();
  const token = await getToken();

  const method = (init.method ?? "GET").toUpperCase();
  console.info("[technext] Requisição iniciada.", { method, path, attempt });

  const response = await fetch(buildUrl(path), {
    ...init,
    redirect: "manual",
    headers: {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/json",
      Authorization: `Token ${token}`,
      ...(init.headers ?? {})
    },
    cache: "no-store"
  });

  if ([301, 302, 307, 308].includes(response.status)) {
    const location = response.headers.get("location");
    console.warn("[technext] Redirecionamento recebido.", { method, path, status: response.status, location });
    if (location) {
      const redirectUrl = location.startsWith("http") ? location : buildUrl(location);
      const redirectedResponse = await fetch(redirectUrl, {
        ...init,
        headers: {
          Accept: "application/json, text/plain, */*",
          "Content-Type": "application/json",
          Authorization: `Token ${token}`,
          ...(init.headers ?? {})
        },
        cache: "no-store"
      });
      console.info("[technext] Resposta após redirecionamento.", { method, path, status: redirectedResponse.status });
      return redirectedResponse;
    }
  }

  if ((response.status === 401 || response.status === 403) && attempt < 1) {
    console.warn("[technext] Token expirado/negado. Tentando reautenticar.", {
      method,
      path,
      status: response.status,
      attempt
    });
    await authenticate();
    return technextRequest(path, init, attempt + 1);
  }

  console.info("[technext] Requisição finalizada.", { method, path, status: response.status, attempt });
  return response;
}

function addOneDayToTolerance(tolerancia: string) {
  const baseDate = new Date(tolerancia);
  const oneDayMs = 24 * 60 * 60 * 1000;
  const updated = new Date(baseDate.getTime() + oneDayMs);

  const tzOffsetMinutes = -3 * 60;
  const localMs = updated.getTime() + tzOffsetMinutes * 60 * 1000;
  const localDate = new Date(localMs);

  const year = localDate.getUTCFullYear();
  const month = String(localDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(localDate.getUTCDate()).padStart(2, "0");
  const hours = String(localDate.getUTCHours()).padStart(2, "0");
  const minutes = String(localDate.getUTCMinutes()).padStart(2, "0");
  const seconds = String(localDate.getUTCSeconds()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}-03:00`;
}

export async function fetchTicket(ticketCode: string): Promise<TechnextTicket> {
  console.info("[technext] Buscando ticket.", { ticketCode });
  const res = await technextRequest(`/buscatickets/${ticketCode}`);
  if (!res.ok) {
    const body = await readResponseBodySafe(res);
    console.error("[technext] Erro ao buscar ticket.", { ticketCode, status: res.status, body });
    throw new Error(`Erro ao buscar ticket (${res.status})`);
  }
  const ticket = (await res.json()) as TechnextTicket;
  console.info("[technext] Ticket encontrado.", sanitizeTicketForLog(ticket));
  return ticket;
}

export async function validateTicket(ticket: TechnextTicket, placaGerada: string) {
  const novaTolerancia = addOneDayToTolerance(ticket.tolerancia);
  const payload = {
    n_ticket: ticket.n_ticket,
    tp_ticket: "A",
    placa: placaGerada,
    dt_entrada: ticket.dt_entrada,
    tolerancia: ticket.tolerancia,
    add_min: 0,
    add_hora: 0,
    add_dia: 1,
    indeterminado: false,
    nova_tolerancia: novaTolerancia,
    id_patio: 35,
    usuario: "epeac.leandro.carvalho",
    status: "V"
  };

  const endpoint = `/tickets/${ticket.n_ticket}/`;
  console.info("[technext] Validando ticket.", {
    endpoint,
    method: "PUT",
    n_ticket: payload.n_ticket,
    placa: payload.placa,
    tolerancia_atual: payload.tolerancia,
    nova_tolerancia: payload.nova_tolerancia,
    status: payload.status,
    payload_completo: payload
  });

  const res = await technextRequest(endpoint, {
    method: "PUT",
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const body = await readResponseBodySafe(res);
    console.error("[technext] Erro ao validar ticket.", {
      n_ticket: ticket.n_ticket,
      status: res.status,
      body
    });
    throw new Error(`Erro ao validar ticket (${res.status})`);
  }
  const updated = await res.json();
  console.info("[technext] Ticket validado com sucesso.", {
    n_ticket: ticket.n_ticket,
    novaTolerancia,
    resposta_put: updated
  });
  return { updated, novaTolerancia };
}

function removeDiacritics(input: string) {
  return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function createFakePlateFromName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const firstNameRaw = parts[0] ?? "";
  const secondNameRaw = parts[1] ?? "";

  const firstName = removeDiacritics(firstNameRaw).replace(/[^a-zA-Z]/g, "");
  const secondName = removeDiacritics(secondNameRaw).replace(/[^a-zA-Z]/g, "");

  const source = firstName.length >= 4 ? firstName : secondName || firstName;
  const base = source.slice(0, 4).toUpperCase().padEnd(4, "X");

  return `${base}123`;
}
