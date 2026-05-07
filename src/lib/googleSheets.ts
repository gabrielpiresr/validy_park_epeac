import { createSign } from "node:crypto";

type AppendValidationLogParams = {
  dataEntrada: string;
  dataValidacao: string;
  numeroTicket: string;
  nomeCompleto: string;
};

const SHEET_NAME = "validacoes";
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

function base64UrlEncode(input: string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function getGoogleSheetsConfig() {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!spreadsheetId || !clientEmail || !privateKey) {
    throw new Error(
      "Configuração do Google Sheets incompleta. Verifique GOOGLE_SHEETS_SPREADSHEET_ID, GOOGLE_SHEETS_CLIENT_EMAIL e GOOGLE_SHEETS_PRIVATE_KEY."
    );
  }

  return { spreadsheetId, clientEmail, privateKey };
}

function createSignedJwt(clientEmail: string, privateKey: string) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: clientEmail,
    scope: GOOGLE_SHEETS_SCOPE,
    aud: GOOGLE_OAUTH_TOKEN_URL,
    exp: now + 3600,
    iat: now
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  const signer = createSign("RSA-SHA256");
  signer.update(unsignedToken);
  const signature = signer.sign(privateKey, "base64url");

  return `${unsignedToken}.${signature}`;
}

async function getAccessToken(clientEmail: string, privateKey: string) {
  const jwt = createSignedJwt(clientEmail, privateKey);

  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Falha ao obter token OAuth do Google (${response.status}): ${body.slice(0, 300)}`);
  }

  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Google OAuth retornou access_token inválido.");
  return data.access_token;
}

export async function appendValidationLog({
  dataEntrada,
  dataValidacao,
  numeroTicket,
  nomeCompleto
}: AppendValidationLogParams) {
  const { spreadsheetId, clientEmail, privateKey } = getGoogleSheetsConfig();
  const accessToken = await getAccessToken(clientEmail, privateKey);

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_NAME}!A:D:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
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

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Falha ao registrar validação no Sheets (${response.status}): ${body.slice(0, 300)}`);
  }
}
