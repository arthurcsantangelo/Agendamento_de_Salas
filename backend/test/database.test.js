import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDatabase } from '../src/database.js';

const config = {
    MYSQL_HOST: 'localhost',
    MYSQL_PORT: '3306',
    MYSQL_DATABASE: 'reserve_me',
    MYSQL_USER: 'reserve_me',
    MYSQL_PASSWORD: 'local-password'
};

test('database adapter uses parameterized SQL for user lookup and creation', async () => {
    const calls = [];
    let closed = false;
    const pool = {
        async execute(sql, parameters = []) {
            calls.push({ sql, parameters });
            if (sql.includes('WHERE email = ?')) {
                return [[{
                    id: '7',
                    nome: 'Ana Souza',
                    email: 'ana@example.com',
                    senha_hash: 'stored-hash'
                }]];
            }
            return [[]];
        },
        async end() {
            closed = true;
        }
    };

    const database = createDatabase(config, (poolOptions) => {
        assert.deepEqual(poolOptions, {
            host: 'localhost',
            port: 3306,
            database: 'reserve_me',
            user: 'reserve_me',
            password: 'local-password',
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        });
        return pool;
    });

    assert.deepEqual(await database.findUserByEmail('ana@example.com'), {
        id: '7',
        nome: 'Ana Souza',
        email: 'ana@example.com',
        senha_hash: 'stored-hash'
    });
    await database.createUser({
        nome: 'Ana Souza',
        email: 'ana@example.com',
        senhaHash: 'stored-hash'
    });
    await database.close();

    assert.match(calls[0].sql, /WHERE email = \?/);
    assert.deepEqual(calls[0].parameters, ['ana@example.com']);
    assert.match(calls[1].sql, /VALUES \(\?, \?, \?\)/);
    assert.deepEqual(calls[1].parameters, ['Ana Souza', 'ana@example.com', 'stored-hash']);
    assert.equal(closed, true);
});
