import { createSign } from "crypto";

type AppendValidationLogInput = {
  dataEntrada: string;
  dataValidacao: string;
  numeroTicket: string;
  nomeCompleto: string;
};

const SHEET_NAME = "validacoes";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

function getGooglePrivateKey() {
  return process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n");
}

function assertGoogleSheetsEnv() {
  const missing: string[] = [];

  if (!process.env.GOOGLE_SHEETS_SPREADSHEET_ID) missing.push("GOOGLE_SHEETS_SPREADSHEET_ID");
  if (!process.env.GOOGLE_SHEETS_CLIENT_EMAIL) missing.push("GOOGLE_SHEETS_CLIENT_EMAIL");
  if (!getGooglePrivateKey()) missing.push("GOOGLE_SHEETS_PRIVATE_KEY");

  if (missing.length > 0) {
    throw new Error(`Variáveis de ambiente ausentes para Google Sheets: ${missing.join(", ")}`);
  }
}

function toBase64Url(input: string | Buffer) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createSignedJwt() {
  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL as string;
  const privateKey = getGooglePrivateKey() as string;
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: clientEmail,
    scope: GOOGLE_SHEETS_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    exp: now + 3600,
    iat: now
  };

  const encodedHeader = toBase64Url(JSON.stringify(header));
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  const signer = createSign("RSA-SHA256");
  signer.update(unsignedToken);
  signer.end();
  const signature = signer.sign(privateKey);

  return `${unsignedToken}.${toBase64Url(signature)}`;
}

async function getAccessToken() {
  assertGoogleSheetsEnv();

  const assertion = createSignedJwt();
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store"
  });

  if (!res.ok) {
    throw new Error(`Falha ao autenticar no Google (${res.status})`);
  }

  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("Token de acesso do Google não retornado.");
  }

  return data.access_token;
}

export async function appendValidationLog({ dataEntrada, dataValidacao, numeroTicket, nomeCompleto }: AppendValidationLogInput) {
  const accessToken = await getAccessToken();
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID as string;
  const range = encodeURIComponent(`${SHEET_NAME}!A:D`);

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        values: [[dataEntrada, dataValidacao, numeroTicket, nomeCompleto]]
      }),
      cache: "no-store"
    }
  );

  if (!res.ok) {
    throw new Error(`Falha ao inserir validação no Google Sheets (${res.status})`);
  }
}
