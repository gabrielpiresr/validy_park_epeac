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
6. Backend gera placa fictícia e valida ticket (`POST /api/tickets/validate`).
7. Tela final exibe nova placa e nova tolerância.

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
5. Faça deploy.

### Observações para produção

- As rotas de API já usam `process.env` no servidor e não expõem token ao cliente.
- Mensagens de erro retornadas ao frontend são amigáveis (sem stack trace ou detalhes internos).
- Evite adicionar logs com conteúdo de `Authorization` ou variáveis sensíveis.
