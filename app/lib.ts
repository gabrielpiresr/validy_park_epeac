export type TicketLookupResponse = {
  id?: string;
  code?: string;
  [key: string]: unknown;
};

const requiredEnv = ["TECHNEXT_BASE_URL", "TECHNEXT_TOKEN", "PIX_COPY_PASTE"] as const;

export function ensureEnv() {
  for (const envKey of requiredEnv) {
    if (!process.env[envKey]) {
      throw new Error(`Variável de ambiente ausente: ${envKey}`);
    }
  }
}

export function buildFakePlate(fullName: string) {
  const clean = fullName.toUpperCase().replace(/[^A-Z]/g, "");
  const letters = (clean + "AAA").slice(0, 3);
  const numbersSeed = fullName
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0)
    .toString()
    .padStart(4, "0");

  return `${letters}${numbersSeed.slice(-4)}`;
}

export function addOneDayISO(date: Date = new Date()) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + 1);
  return nextDate.toISOString();
}

export async function technextRequest<T>(path: string, init?: RequestInit): Promise<T> {
  ensureEnv();
  const base = process.env.TECHNEXT_BASE_URL as string;
  const token = process.env.TECHNEXT_TOKEN as string;

  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {})
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Erro API TechNext (${response.status}): ${body}`);
  }

  return (await response.json()) as T;
}
