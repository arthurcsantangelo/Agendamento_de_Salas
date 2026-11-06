import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    createAccessToken,
    hashPassword,
    verifyAccessToken,
    verifyPassword
} from '../src/auth.js';

const secret = 'test-secret-with-at-least-thirty-two-characters';

test('hashPassword creates a salted hash that verifies the original password', async () => {
    const firstHash = await hashPassword('senha-segura');
    const secondHash = await hashPassword('senha-segura');

    assert.notEqual(firstHash, secondHash);
    assert.equal(await verifyPassword('senha-segura', firstHash), true);
    assert.equal(await verifyPassword('senha-incorreta', firstHash), false);
});

test('verifyPassword rejects malformed or unsupported hashes', async () => {
    assert.equal(await verifyPassword('senha-segura', 'invalid'), false);
    assert.equal(await verifyPassword('senha-segura', 'scrypt$1$1$1$bad$bad'), false);
});

test('createAccessToken returns a verifiable token with an expiry', () => {
    const now = 1_800_000_000;
    const token = createAccessToken(
        { id: 42, email: 'ana@example.com' },
        secret,
        { now, expiresIn: 60 }
    );

    assert.deepEqual(verifyAccessToken(token, secret, { now }), {
        sub: '42',
        email: 'ana@example.com',
        iat: now,
        exp: now + 60
    });
});

test('verifyAccessToken rejects invalid signatures, malformed tokens, and expired tokens', () => {
    const token = createAccessToken(
        { id: 42, email: 'ana@example.com' },
        secret,
        { now: 1_800_000_000, expiresIn: 60 }
    );

    assert.equal(verifyAccessToken(token, `${secret}-wrong`), null);
    assert.equal(verifyAccessToken(`${token}x`, secret), null);
    assert.equal(verifyAccessToken('not-a-token', secret), null);
    assert.equal(
        verifyAccessToken(token, secret, { now: 1_800_000_061 }),
        null
    );
});
