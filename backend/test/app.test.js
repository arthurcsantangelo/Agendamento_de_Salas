import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createApp } from '../src/app.js';
import { hashPassword, verifyAccessToken, verifyPassword } from '../src/auth.js';
import { createDatabase } from '../src/database.js';

const servers = new Set();
const authTokenSecret = 'test-secret-with-at-least-thirty-two-characters';

afterEach(async () => {
    await Promise.all([...servers].map((server) => new Promise((resolve, reject) => {
        server.close((error) => {
            servers.delete(server);
            if (error) {
                reject(error);
                return;
            }
            resolve();
        });
    })));
});

async function startServer(database, allowedOrigins = []) {
    const server = createApp({ database, allowedOrigins, authTokenSecret }).listen(0);
    servers.add(server);
    await new Promise((resolve, reject) => {
        server.once('listening', resolve);
        server.once('error', reject);
    });
    return `http://127.0.0.1:${server.address().port}`;
}

test('GET /api/health reports a successful database connection', async () => {
    let pingCalls = 0;
    const baseUrl = await startServer({
        async ping() {
            pingCalls += 1;
        }
    });

    const response = await fetch(`${baseUrl}/api/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
        status: 'ok',
        database: 'connected'
    });
    assert.equal(pingCalls, 1);
});

test('GET /api/health reports a database failure as unavailable', async () => {
    const originalConsoleError = console.error;
    console.error = () => {};

    try {
        const baseUrl = await startServer({
            async ping() {
                throw new Error('database connection failed');
            }
        });

        const response = await fetch(`${baseUrl}/api/health`);
        assert.equal(response.status, 503);
        assert.deepEqual(await response.json(), {
            status: 'error',
            database: 'unavailable'
        });
    } finally {
        console.error = originalConsoleError;
    }
});

test('rejects browser origins not present in the CORS allowlist', async () => {
    const baseUrl = await startServer({ async ping() {} }, ['http://localhost:5500']);
    const allowedResponse = await fetch(`${baseUrl}/api/health`, {
        headers: { Origin: 'http://localhost:5500' }
    });
    const rejectedResponse = await fetch(`${baseUrl}/api/health`, {
        headers: { Origin: 'https://untrusted.example' }
    });

    assert.equal(allowedResponse.headers.get('access-control-allow-origin'), 'http://localhost:5500');
    assert.equal(rejectedResponse.status, 200);
    assert.equal(rejectedResponse.headers.get('access-control-allow-origin'), null);
});

test('requires database configuration before creating a connection pool', () => {
    assert.throws(
        () => createDatabase({}),
        /MYSQL_HOST, MYSQL_DATABASE, MYSQL_USER, MYSQL_PASSWORD/
    );
});

test('requires a strong token secret when creating the application', () => {
    assert.throws(
        () => createApp({ database: {}, authTokenSecret: 'short' }),
        /AUTH_TOKEN_SECRET deve conter pelo menos 32 bytes/
    );
});

test('POST /api/auth/register creates a user with a password hash', async () => {
    let createdUser;
    const baseUrl = await startServer({
        async createUser(user) {
            createdUser = user;
        }
    });

    const response = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            nome: '  Ana Souza ',
            email: ' Ana@Example.com ',
            password: 'uma-senha-segura'
        })
    });

    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), {
        message: 'Conta criada com sucesso.',
        user: { nome: 'Ana Souza', email: 'ana@example.com' }
    });
    assert.equal(createdUser.nome, 'Ana Souza');
    assert.equal(createdUser.email, 'ana@example.com');
    assert.equal(await verifyPassword('uma-senha-segura', createdUser.senhaHash), true);
});

test('POST /api/auth/register validates fields before creating an account', async () => {
    let createCalls = 0;
    const baseUrl = await startServer({
        async createUser() {
            createCalls += 1;
        }
    });

    const response = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            nome: 'Ana Souza',
            email: 'ana@example.com',
            password: 'curta'
        })
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
        error: 'Informe nome, e-mail válido e senha com 12 a 128 caracteres.'
    });
    assert.equal(createCalls, 0);
});

test('POST /api/auth/register reports duplicate email without exposing database errors', async () => {
    const baseUrl = await startServer({
        async createUser() {
            throw Object.assign(new Error('duplicate key'), { code: 'ER_DUP_ENTRY' });
        }
    });

    const response = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            nome: 'Ana Souza',
            email: 'ana@example.com',
            password: 'uma-senha-segura'
        })
    });

    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
        error: 'Já existe uma conta com esse e-mail.'
    });
});

test('POST /api/auth/login returns an access token and public user data', async () => {
    const passwordHash = await hashPassword('senha-segura');
    let lookupEmail;
    const baseUrl = await startServer({
        async findUserByEmail(email) {
            lookupEmail = email;
            return {
                id: 42,
                nome: 'Ana Souza',
                email: 'ana@example.com',
                senha_hash: passwordHash
            };
        }
    });

    const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: '  Ana@Example.com ', password: 'senha-segura' })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(lookupEmail, 'ana@example.com');
    assert.equal(body.tokenType, 'Bearer');
    assert.equal(body.expiresIn, 3600);
    assert.deepEqual(body.user, { id: '42', nome: 'Ana Souza', email: 'ana@example.com' });
    assert.deepEqual(
        verifyAccessToken(body.token, authTokenSecret).email,
        'ana@example.com'
    );
    assert.equal(Object.hasOwn(body, 'senha_hash'), false);
});

test('POST /api/auth/login returns the same unauthorized response for unknown users and wrong passwords', async () => {
    const passwordHash = await hashPassword('senha-segura');
    const baseUrl = await startServer({
        async findUserByEmail(email) {
            return email === 'ana@example.com'
                ? { id: 42, nome: 'Ana Souza', email, senha_hash: passwordHash }
                : null;
        }
    });

    const responses = await Promise.all(['ana@example.com', 'unknown@example.com'].map((email) => (
        fetch(`${baseUrl}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: 'senha-errada' })
        })
    )));

    assert.deepEqual(responses.map((response) => response.status), [401, 401]);
    assert.deepEqual(
        await Promise.all(responses.map((response) => response.json())),
        [{ error: 'E-mail ou senha inválidos.' }, { error: 'E-mail ou senha inválidos.' }]
    );
});

test('POST /api/auth/login validates required fields before querying the database', async () => {
    let lookupCalls = 0;
    const baseUrl = await startServer({
        async findUserByEmail() {
            lookupCalls += 1;
            return null;
        }
    });

    const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'invalido', password: '' })
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'Informe um e-mail e uma senha válidos.' });
    assert.equal(lookupCalls, 0);
});

test('POST /api/auth/login reports database failures without exposing internals', async () => {
    const originalConsoleError = console.error;
    console.error = () => {};

    try {
        const baseUrl = await startServer({
            async findUserByEmail() {
                throw new Error('database connection failed');
            }
        });

        const response = await fetch(`${baseUrl}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'ana@example.com', password: 'senha-segura' })
        });

        assert.equal(response.status, 500);
        assert.deepEqual(await response.json(), { error: 'Não foi possível autenticar.' });
    } finally {
        console.error = originalConsoleError;
    }
});
