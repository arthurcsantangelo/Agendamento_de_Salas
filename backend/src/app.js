import cors from 'cors';
import express from 'express';
import {
    checkUnknownUserPassword,
    createAccessToken,
    normalizeEmail,
    validateTokenSecret,
    verifyPassword
} from './auth.js';

/**
 * Cria a aplicação HTTP e registra os endpoints da API.
 *
 * @param {{database: object, allowedOrigins?: string[], authTokenSecret: string}} options
 *   Dependências e configurações da aplicação.
 * @returns {import('express').Express} Aplicação pronta para receber requisições.
 */
export function createApp({ database, allowedOrigins = [], authTokenSecret }) {
    validateTokenSecret(authTokenSecret);
    const app = express();
    const origins = new Set(allowedOrigins);

    app.use(cors({
        origin(origin, callback) {
            if (!origin || origins.has(origin)) {
                callback(null, true);
                return;
            }

            callback(null, false);
        }
    }));
    app.use(express.json({ limit: '100kb' }));

    app.get('/api/health', async (request, response) => {
        try {
            await database.ping();
            response.status(200).json({ status: 'ok', database: 'connected' });
        } catch (error) {
            console.error('Falha ao verificar conexão com o banco de dados:', error);
            response.status(503).json({ status: 'error', database: 'unavailable' });
        }
    });

    app.post('/api/auth/login', async (request, response) => {
        const body = request.body ?? {};
        const email = normalizeEmail(body.email);
        const { password } = body;

        if (
            !email
            || typeof password !== 'string'
            || password.length === 0
            || password.length > 128
        ) {
            response.status(400).json({
                error: 'Informe um e-mail e uma senha válidos.'
            });
            return;
        }

        try {
            const user = await database.findUserByEmail(email);
            if (!user) {
                await checkUnknownUserPassword(password);
                response.status(401).json({ error: 'E-mail ou senha inválidos.' });
                return;
            }

            if (!(await verifyPassword(password, user.senha_hash))) {
                response.status(401).json({ error: 'E-mail ou senha inválidos.' });
                return;
            }

            response.status(200).json({
                token: createAccessToken(user, authTokenSecret),
                tokenType: 'Bearer',
                expiresIn: 3600,
                user: {
                    id: String(user.id),
                    nome: user.nome,
                    email: user.email
                }
            });
        } catch (error) {
            console.error('Falha ao autenticar usuário:', error);
            response.status(500).json({ error: 'Não foi possível autenticar.' });
        }
    });

    return app;
}
