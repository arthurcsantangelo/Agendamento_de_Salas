import {
    createHmac,
    randomBytes,
    scrypt,
    timingSafeEqual
} from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const SCRYPT_COST = 16_384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const PASSWORD_HASH_LENGTH = 64;
const PASSWORD_SALT_LENGTH = 16;
const TOKEN_HEADER = Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url');
const MAX_PASSWORD_BYTES = 1024;
const dummyPasswordHashPromise = hashPassword('reserve-me-dummy-account-password');

/**
 * Normaliza um e-mail de login e rejeita endereços fora do formato esperado.
 *
 * @param {unknown} email Valor recebido na requisição.
 * @returns {string|null} E-mail normalizado ou `null` quando inválido.
 */
export function normalizeEmail(email) {
    if (typeof email !== 'string') {
        return null;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (
        normalizedEmail.length > 254
        || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    ) {
        return null;
    }

    return normalizedEmail;
}

/**
 * Cria um hash de senha com scrypt e um salt aleatório por conta.
 *
 * @param {string} password Senha em texto recebida para armazenamento.
 * @returns {Promise<string>} Hash autocontido que inclui algoritmo e salt.
 */
export async function hashPassword(password) {
    if (
        typeof password !== 'string'
        || password.length === 0
        || Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES
    ) {
        throw new TypeError('A senha deve ser uma string de até 1024 bytes.');
    }

    const salt = randomBytes(PASSWORD_SALT_LENGTH);
    const derivedKey = await scryptAsync(password, salt, PASSWORD_HASH_LENGTH, {
        N: SCRYPT_COST,
        r: SCRYPT_BLOCK_SIZE,
        p: SCRYPT_PARALLELIZATION,
        maxmem: 64 * 1024 * 1024
    });

    return [
        'scrypt',
        SCRYPT_COST,
        SCRYPT_BLOCK_SIZE,
        SCRYPT_PARALLELIZATION,
        salt.toString('base64url'),
        derivedKey.toString('base64url')
    ].join('$');
}

/**
 * Compara uma senha com um hash criado por {@link hashPassword}.
 *
 * @param {string} password Senha fornecida no login.
 * @param {string} encodedHash Hash armazenado para a conta.
 * @returns {Promise<boolean>} `true` apenas quando a senha corresponde.
 */
export async function verifyPassword(password, encodedHash) {
    if (
        typeof password !== 'string'
        || Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES
        || typeof encodedHash !== 'string'
    ) {
        return false;
    }

    const parts = encodedHash.split('$');
    if (
        parts.length !== 6
        || parts[0] !== 'scrypt'
        || Number(parts[1]) !== SCRYPT_COST
        || Number(parts[2]) !== SCRYPT_BLOCK_SIZE
        || Number(parts[3]) !== SCRYPT_PARALLELIZATION
    ) {
        return false;
    }

    const salt = Buffer.from(parts[4], 'base64url');
    const expectedHash = Buffer.from(parts[5], 'base64url');
    if (
        salt.length !== PASSWORD_SALT_LENGTH
        || expectedHash.length !== PASSWORD_HASH_LENGTH
    ) {
        return false;
    }

    const actualHash = await scryptAsync(password, salt, PASSWORD_HASH_LENGTH, {
        N: SCRYPT_COST,
        r: SCRYPT_BLOCK_SIZE,
        p: SCRYPT_PARALLELIZATION,
        maxmem: 64 * 1024 * 1024
    });

    return timingSafeEqual(actualHash, expectedHash);
}

/**
 * Gera um JWT HS256 com prazo de validade explícito.
 *
 * @param {{id: string|number, email: string}} user Conta autenticada.
 * @param {string} secret Segredo de assinatura com no mínimo 32 bytes.
 * @param {{now?: number, expiresIn?: number}} [options] Opções usadas também
 *   para testar validade e expiração.
 * @returns {string} Token assinado.
 */
export function createAccessToken(user, secret, options = {}) {
    validateTokenSecret(secret);
    const now = options.now ?? Math.floor(Date.now() / 1000);
    const expiresIn = options.expiresIn ?? 3600;

    if (!Number.isSafeInteger(now) || !Number.isSafeInteger(expiresIn) || expiresIn <= 0) {
        throw new TypeError('A validade do token deve ser um número inteiro positivo.');
    }

    const payload = Buffer.from(JSON.stringify({
        sub: String(user.id),
        email: user.email,
        iat: now,
        exp: now + expiresIn
    })).toString('base64url');
    const content = `${TOKEN_HEADER}.${payload}`;
    const signature = signToken(content, secret);

    return `${content}.${signature}`;
}

/**
 * Verifica assinatura e expiração de um JWT HS256.
 *
 * @param {string} token Token recebido no cabeçalho Authorization.
 * @param {string} secret Segredo usado para assinar o token.
 * @param {{now?: number}} [options] Relógio opcional em segundos Unix.
 * @returns {{sub: string, email: string, iat: number, exp: number}|null}
 *   Claims do token ou `null` se for inválido ou estiver expirado.
 */
export function verifyAccessToken(token, secret, options = {}) {
    validateTokenSecret(secret);
    if (typeof token !== 'string') {
        return null;
    }

    const parts = token.split('.');
    if (
        parts.length !== 3
        || parts[0] !== TOKEN_HEADER
        || !/^[A-Za-z0-9_-]+$/.test(parts[1])
        || !/^[A-Za-z0-9_-]+$/.test(parts[2])
    ) {
        return null;
    }

    const expectedSignature = Buffer.from(signToken(`${parts[0]}.${parts[1]}`, secret));
    const receivedSignature = Buffer.from(parts[2]);
    if (
        expectedSignature.length !== receivedSignature.length
        || !timingSafeEqual(expectedSignature, receivedSignature)
    ) {
        return null;
    }

    let payload;
    try {
        payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    } catch {
        return null;
    }

    const now = options.now ?? Math.floor(Date.now() / 1000);
    if (
        !payload
        || typeof payload.sub !== 'string'
        || typeof payload.email !== 'string'
        || !Number.isSafeInteger(payload.iat)
        || !Number.isSafeInteger(payload.exp)
        || payload.exp <= now
        || payload.iat > now
    ) {
        return null;
    }

    return {
        sub: payload.sub,
        email: payload.email,
        iat: payload.iat,
        exp: payload.exp
    };
}

/**
 * Executa o custo de hash para logins inexistentes e reduz diferenças de tempo
 * que poderiam revelar se um e-mail está cadastrado.
 *
 * @param {string} password Senha informada no login.
 * @returns {Promise<void>}
 */
export async function checkUnknownUserPassword(password) {
    const dummyPasswordHash = await dummyPasswordHashPromise;
    await verifyPassword(password, dummyPasswordHash);
}

/**
 * Garante que tokens não sejam assinados com segredos fracos ou ausentes.
 *
 * @param {string} secret Segredo configurado para autenticação.
 * @returns {void}
 */
export function validateTokenSecret(secret) {
    if (typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < 32) {
        throw new Error('AUTH_TOKEN_SECRET deve conter pelo menos 32 bytes.');
    }
}

function signToken(content, secret) {
    return createHmac('sha256', secret).update(content).digest('base64url');
}
