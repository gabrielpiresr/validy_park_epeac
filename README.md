# Validação de Ticket (Next.js)

Aplicação web para consultar ticket, exibir PIX copia e cola e validar/atualizar ticket na Technext.

## Rodar localmente

1. Instale dependências:

```bash
npm install
```

2. Crie o `.env.local` com base no `.env.example`.

3. Rode em desenvolvimento:

```bash
npm run dev
```

4. Abra `http://localhost:3000`.

## Variáveis de ambiente

Use as variáveis abaixo (server-side):

- `TECHNEXT_BASE_URL` URL base da API Technext.
- `TECHNEXT_TOKEN` token inicial opcional para evitar primeira autenticação.
- `TECHNEXT_USERNAME` usuário para autenticar e renovar token.
- `TECHNEXT_PASSWORD` senha para autenticar e renovar token.
- `PIX_COPY_PASTE` código PIX copia e cola exibido para o usuário.
- `GOOGLE_SHEETS_SPREADSHEET_ID` ID da planilha para registrar validações.
- `GOOGLE_SHEETS_CLIENT_EMAIL` client email da service account do Google.
- `GOOGLE_SHEETS_PRIVATE_KEY` private key da service account (com `\n` escapado em ambiente).

> Segurança:
> - Não use `NEXT_PUBLIC_` para segredos.
> - Não versionar `.env.local`.
> - Token Technext e PIX ficam apenas no backend (rotas `app/api/*`).

## Fluxo do app

1. Usuário informa o código do ticket.
2. Backend consulta ticket na Technext (`POST /api/tickets/search`).
3. Frontend busca PIX no backend (`GET /api/pix`).
4. Usuário copia PIX e confirma pagamento.
5. Usuário informa nome completo.
6. Backend gera placa fictícia, valida ticket (`POST /api/tickets/validate`) e, após sucesso no PUT, tenta registrar a validação no Google Sheets (aba `validacoes`).
7. Se o registro no Sheets falhar, a validação permanece concluída e o erro é apenas logado no servidor.
8. Tela final exibe nova placa e nova tolerância.

## Deploy na Vercel

1. Suba o repositório para GitHub/GitLab/Bitbucket.
2. Na Vercel, importe o projeto.
3. Framework detectado: **Next.js**.
4. Em **Settings > Environment Variables**, configure:
   - `TECHNEXT_BASE_URL`
   - `TECHNEXT_TOKEN`
   - `TECHNEXT_USERNAME`
   - `TECHNEXT_PASSWORD`
   - `PIX_COPY_PASTE`
   - `GOOGLE_SHEETS_SPREADSHEET_ID`
   - `GOOGLE_SHEETS_CLIENT_EMAIL`
   - `GOOGLE_SHEETS_PRIVATE_KEY`
5. Faça deploy.

### Observações para produção

- As rotas de API já usam `process.env` no servidor e não expõem token ao cliente.
- Mensagens de erro retornadas ao frontend são amigáveis (sem stack trace ou detalhes internos).
- Evite adicionar logs com conteúdo de `Authorization` ou variáveis sensíveis.


## Registro no Google Sheets

- Implementado via Google Sheets API v4 no backend (`src/lib/googleSheets.ts`).
- Não usa Google Apps Script e não expõe credenciais ao frontend.
- A chave privada é tratada com `replace(/\\n/g, "\n")`, compatível com variáveis da Vercel.
- Colunas registradas na aba `validacoes`: `data_entrada`, `data_validacao`, `numero_ticket`, `nome_completo`.
- `data_validacao` usa timezone `America/Sao_Paulo` no formato `YYYY-MM-DD HH:mm:ss`.
