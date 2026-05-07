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
  if (!runtimeToken) missing.push("TECHNEXT_TOKEN");

  if (missing.length > 0) {
    throw new Error(`Variáveis de ambiente ausentes: ${missing.join(", ")}`);
  }
}

function buildUrl(path: string) {
  const base = (env.baseUrl ?? "").replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

async function authenticate(): Promise<string> {
  if (!env.baseUrl || !env.username || !env.password) {
    throw new Error("Configuração de autenticação incompleta da Technext.");
  }

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
    throw new Error(`Falha ao autenticar na Technext (${res.status})`);
  }

  const data = (await res.json()) as AuthResponse;
  if (!data.token) throw new Error("Token inválido retornado pela Technext.");
  runtimeToken = data.token;
  return data.token;
}

async function technextRequest(path: string, init: RequestInit = {}, attempt = 0): Promise<Response> {
  assertEnv();
  const token = runtimeToken as string;

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
    if (location) {
      const redirectUrl = location.startsWith("http") ? location : buildUrl(location);
      return fetch(redirectUrl, {
        ...init,
        headers: {
          Accept: "application/json, text/plain, */*",
          "Content-Type": "application/json",
          Authorization: `Token ${token}`,
          ...(init.headers ?? {})
        },
        cache: "no-store"
      });
    }
  }

  if ((response.status === 401 || response.status === 403) && attempt < 1) {
    await authenticate();
    return technextRequest(path, init, attempt + 1);
  }

  return response;
}

function addOneDayToTolerance(tolerancia: string) {
  const dt = new Date(tolerancia);
  dt.setDate(dt.getDate() + 1);
  return dt.toISOString();
}

export async function fetchTicket(ticketCode: string): Promise<TechnextTicket> {
  const res = await technextRequest(`/buscatickets/${ticketCode}`);
  if (!res.ok) throw new Error(`Erro ao buscar ticket (${res.status})`);
  return (await res.json()) as TechnextTicket;
}

export async function validateTicket(ticket: TechnextTicket, placaGerada: string) {
  const novaTolerancia = addOneDayToTolerance(ticket.tolerancia);
  const payload = {
    n_ticket: ticket.n_ticket,
    tp_ticket: ticket.tp_ticket,
    placa: placaGerada,
    dt_entrada: ticket.dt_entrada,
    tolerancia: ticket.tolerancia,
    add_min: 0,
    add_hora: 0,
    add_dia: 1,
    indeterminado: false,
    nova_tolerancia: novaTolerancia,
    id_patio: null,
    usuario: ticket.usuario,
    status: ticket.status
  };

  const res = await technextRequest(`/tickets/${ticket.n_ticket}/`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });

  if (!res.ok) throw new Error(`Erro ao validar ticket (${res.status})`);
  return { updated: await res.json(), novaTolerancia };
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
