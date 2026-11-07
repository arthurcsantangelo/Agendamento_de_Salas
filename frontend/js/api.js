const API_BASE_URL = window.RESERVE_ME_API_URL || 'http://localhost:3000/api';
const API_BASE = new URL(API_BASE_URL, window.location.origin);
const API_BASE_PATH = API_BASE.pathname.replace(/\/+$/, '');

async function requestApi(path, options = {}) {
    if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
        throw new TypeError('O caminho da API deve ser local e começar com uma barra.');
    }

    const url = new URL(`${API_BASE_PATH}${path}`, API_BASE.origin);
    if (
        url.origin !== API_BASE.origin
        || !url.pathname.startsWith(`${API_BASE_PATH}/`)
    ) {
        throw new TypeError('O caminho solicitado está fora da API.');
    }

    const headers = new Headers(options.headers);
    let body = options.body;

    if (body !== undefined && typeof body !== 'string') {
        headers.set('Content-Type', 'application/json');
        body = JSON.stringify(body);
    }

    const response = await fetch(url, {
        ...options,
        headers,
        body
    });

    if (response.status === 204) {
        if (!response.ok) {
            throw new Error(`A API respondeu com o status ${response.status}.`);
        }
        return null;
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
        if (!response.ok) {
            throw new Error(`A API respondeu com o status ${response.status}.`);
        }
        throw new Error('A API retornou uma resposta que não é JSON.');
    }

    const result = await response.json();
    if (!response.ok) {
        throw new Error(result.error || `A API respondeu com o status ${response.status}.`);
    }

    return result;
}

window.reserveMeApi = Object.freeze({ request: requestApi });
