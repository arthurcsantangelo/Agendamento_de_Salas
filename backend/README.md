# Backend

API Node.js separada do frontend, com conexão MySQL via pool e banco local em Docker.

## Preparar ambiente

1. Copie `.env.example` para `.env` e ajuste as credenciais se necessário.
2. Gere um segredo para os tokens e configure `AUTH_TOKEN_SECRET` no `.env`.
   Use pelo menos 32 bytes aleatórios; por exemplo:
   `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`.
3. Inicie o banco: `docker compose up -d mysql`. Na primeira inicializacao, o
   Docker cria as tabelas `salas`, `reservas` e `usuarios` e insere tres salas
   e cinco reservas de exemplo a partir de `database/init`.
4. Instale as dependências: `npm install`.
5. Inicie a API em modo de desenvolvimento: `npm run dev`.
6. Execute os testes: `npm test`.

A API fica disponível em `http://localhost:3000`. O endpoint `GET /api/health`
verifica a conexão com o MySQL e responde com `503` quando o banco não estiver
disponível. Configure `CORS_ORIGINS` no `.env` para autorizar a origem do servidor
estático do frontend. O cliente do frontend usa `http://localhost:3000/api` por padrão;
para outro ambiente, defina `window.RESERVE_ME_API_URL` antes de carregar `js/api.js`.

As credenciais padrão do Compose são somente para desenvolvimento local; não as
utilize em ambientes compartilhados ou de produção.

Os recursos de cada sala são armazenados como uma lista JSON. As situacoes
permitidas para reservas sao `cancelada`, `aprovada` e `pendente`. O script de
inicializacao nao apaga nem substitui dados existentes. Scripts da pasta de
inicializacao do MySQL sao executados automaticamente somente quando o volume
do banco e criado pela primeira vez.

## Login

As contas não têm cadastro público. Para provisionar uma conta, execute
`npm run user:create` em um terminal interativo. O comando solicita o e-mail,
nome e senha sem exibir a senha digitada; senhas precisam ter de 12 a 128
caracteres. Senhas são armazenadas com scrypt e salt aleatório.

Se o volume MySQL já existia antes da adição da tabela de usuários, aplique a
migração uma vez:

```sh
docker compose exec mysql mysql -u reserve_me -p reserve_me
```

No prompt do MySQL, execute
`SOURCE /docker-entrypoint-initdb.d/002_usuarios.sql;` e depois `EXIT;`.

### `POST /api/auth/login`

Autentica uma conta e retorna um JWT HS256 com validade de uma hora. Envie
`Content-Type: application/json` com:

```json
{
  "email": "ana@example.com",
  "password": "senha-da-conta"
}
```

Resposta `200`:

```json
{
  "token": "<jwt>",
  "tokenType": "Bearer",
  "expiresIn": 3600,
  "user": {
    "id": "1",
    "nome": "Ana Souza",
    "email": "ana@example.com"
  }
}
```

Credenciais incorretas retornam `401` com a mesma mensagem para e-mails
cadastrados e inexistentes. Campos inválidos retornam `400`; falhas no banco
retornam `500` sem expor detalhes internos. Envie o token em
`Authorization: Bearer <token>` nos endpoints que forem protegidos pela API.

As funções exportadas em `src/auth.js`, `src/app.js` e `src/database.js` têm
comentários JSDoc com tipos e descrições dos parâmetros e retornos.
