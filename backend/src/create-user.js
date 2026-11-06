import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { createDatabase } from './database.js';
import { hashPassword, normalizeEmail } from './auth.js';

const MINIMUM_PASSWORD_LENGTH = 12;

/**
 * Solicita os dados de uma conta administrativa e grava somente o hash da senha.
 *
 * @returns {Promise<void>}
 */
async function main() {
    const prompts = createInterface({ input: stdin, output: stdout });
    let emailInput;
    let nomeInput;

    try {
        emailInput = await prompts.question('E-mail: ');
        nomeInput = await prompts.question('Nome: ');
    } finally {
        prompts.close();
    }

    const email = normalizeEmail(emailInput);
    const nome = nomeInput.trim();
    if (!email || nome.length === 0 || nome.length > 160) {
        throw new Error('Informe um e-mail válido e um nome de até 160 caracteres.');
    }

    const password = await readPassword('Senha (mínimo de 12 caracteres): ');
    const confirmation = await readPassword('Confirme a senha: ');
    if (password.length < MINIMUM_PASSWORD_LENGTH || password.length > 128) {
        throw new Error('A senha deve ter entre 12 e 128 caracteres.');
    }
    if (password !== confirmation) {
        throw new Error('As senhas informadas não coincidem.');
    }

    const database = createDatabase();
    try {
        await database.createUser({
            nome,
            email,
            senhaHash: await hashPassword(password)
        });
        console.log(`Conta criada para ${email}.`);
    } finally {
        await database.close();
    }
}

/**
 * Lê uma senha sem exibir os caracteres digitados no terminal.
 *
 * @param {string} prompt Texto exibido antes da entrada.
 * @returns {Promise<string>} Senha digitada.
 */
function readPassword(prompt) {
    if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
        throw new Error('Execute este comando em um terminal interativo para digitar a senha com segurança.');
    }

    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    stdin.resume();

    return new Promise((resolve, reject) => {
        let password = '';

        function cleanup() {
            stdin.removeListener('data', handleInput);
            stdin.removeListener('end', handleEnd);
            stdin.setRawMode(false);
            stdout.write('\n');
        }

        function handleEnd() {
            cleanup();
            reject(new Error('A entrada do terminal foi encerrada antes de concluir a senha.'));
        }

        function handleInput(input) {
            if (input.includes('\u0003')) {
                cleanup();
                reject(new Error('Operação cancelada.'));
                return;
            }

            if (input.includes('\r') || input.includes('\n')) {
                cleanup();
                resolve(password);
                return;
            }

            for (const character of input) {
                if (character === '\u007f' || character === '\u0008') {
                    password = Array.from(password).slice(0, -1).join('');
                } else if (character >= ' ') {
                    password += character;
                }
            }
        }

        stdin.on('data', handleInput);
        stdin.once('end', handleEnd);
    });
}

main().catch((error) => {
    if (error.code === 'ER_DUP_ENTRY') {
        console.error('Já existe uma conta com esse e-mail.');
    } else {
        console.error(`Não foi possível criar a conta: ${error.message}`);
    }
    process.exitCode = 1;
});
