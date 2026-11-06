import mysql from 'mysql2/promise';

/**
 * Cria o pool MySQL usado pela API.
 *
 * @param {NodeJS.ProcessEnv} [config=process.env] Configuração do processo.
 * @param {(options: object) => object} [poolFactory=mysql.createPool] Fábrica
 *   de pools, substituível em testes automatizados.
 * @returns {{ping: () => Promise<void>, findUserByEmail: (email: string) => Promise<object|null>, createUser: (user: {nome: string, email: string, senhaHash: string}) => Promise<void>, close: () => Promise<void>}}
 *   Operações de banco usadas pela aplicação.
 */
export function createDatabase(config = process.env, poolFactory = mysql.createPool) {
    const requiredVariables = [
        'MYSQL_HOST',
        'MYSQL_DATABASE',
        'MYSQL_USER',
        'MYSQL_PASSWORD'
    ];

    const missingVariables = requiredVariables.filter((name) => !config[name]);
    if (missingVariables.length > 0) {
        throw new Error(`Variáveis de banco ausentes: ${missingVariables.join(', ')}`);
    }

    const pool = poolFactory({
        host: config.MYSQL_HOST,
        port: Number(config.MYSQL_PORT || 3306),
        database: config.MYSQL_DATABASE,
        user: config.MYSQL_USER,
        password: config.MYSQL_PASSWORD,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });

    return {
        async ping() {
            await pool.execute('SELECT 1');
        },
        async findUserByEmail(email) {
            const [rows] = await pool.execute(
                `SELECT id, nome, email, senha_hash
                 FROM usuarios
                 WHERE email = ?
                 LIMIT 1`,
                [email]
            );
            return rows[0] ?? null;
        },
        async createUser({ nome, email, senhaHash }) {
            await pool.execute(
                `INSERT INTO usuarios (nome, email, senha_hash)
                 VALUES (?, ?, ?)`,
                [nome, email, senhaHash]
            );
        },
        close() {
            return pool.end();
        }
    };
}
