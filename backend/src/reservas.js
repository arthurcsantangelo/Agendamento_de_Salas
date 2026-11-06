function obterDataHora(valor, campo) {
    if (!(valor instanceof Date) && typeof valor !== 'string') {
        throw new TypeError(`${campo} deve ser uma data ou string.`);
    }

    const dataHora = valor instanceof Date
        ? valor
        : new Date(valor.replace(' ', 'T'));

    if (Number.isNaN(dataHora.getTime())) {
        throw new TypeError(`${campo} deve conter uma data válida.`);
    }

    return dataHora;
}

function obterData(valor, campo) {
    const dataHora = obterDataHora(valor, campo);
    if (typeof valor === 'string') {
        return valor.slice(0, 10);
    }

    return dataHora.toISOString().slice(0, 10);
}

function intervalosConflitam(inicioA, fimA, inicioB, fimB) {
    if (inicioA >= fimA || inicioB >= fimB) {
        throw new RangeError('O fim de cada reserva deve ser posterior ao início.');
    }

    return inicioA < fimB && inicioB < fimA;
}

export function horariosConflitam(inicioA, fimA, inicioB, fimB) {
    return intervalosConflitam(
        obterDataHora(inicioA, 'inicioA'),
        obterDataHora(fimA, 'fimA'),
        obterDataHora(inicioB, 'inicioB'),
        obterDataHora(fimB, 'fimB')
    );
}

/**
 * Verifica se uma sala cadastrada comporta a quantidade de alunos informada.
 *
 * @param {number} quantidadeAlunos Quantidade de alunos da turma.
 * @param {string|number} salaId Identificador da sala que será verificada.
 * @param {Array<{id: string|number, capacidade: number}>} salas Salas cadastradas.
 * @returns {boolean} `true` quando a sala existe e tem capacidade suficiente.
 */
export function cabeNaSala(quantidadeAlunos, salaId, salas) {
    const sala = salas.find((salaCadastrada) => (
        String(salaCadastrada.id) === String(salaId)
    ));

    if (!sala) {
        return false;
    }

    return quantidadeAlunos <= sala.capacidade;
}

export function existeConflito(novaReserva, reservas) {
    if (!novaReserva || typeof novaReserva !== 'object') {
        throw new TypeError('novaReserva deve ser um objeto.');
    }

    if (!Array.isArray(reservas)) {
        throw new TypeError('reservas deve ser uma lista.');
    }

    if (
        obterDataHora(novaReserva.data_inicio, 'data_inicio')
        >= obterDataHora(novaReserva.data_fim, 'data_fim')
    ) {
        throw new RangeError('O fim da nova reserva deve ser posterior ao início.');
    }

    const dataNovaReserva = obterData(novaReserva.data_inicio, 'data_inicio');

    return reservas.some((reserva) => {
        const situacao = String(reserva.situacao ?? reserva.status ?? '')
            .trim()
            .toLowerCase();

        if (
            reserva.sala_id !== novaReserva.sala_id
            || situacao === 'cancelada'
            || situacao === 'canceladas'
            || obterData(reserva.data_inicio, 'data_inicio') !== dataNovaReserva
        ) {
            return false;
        }

        return horariosConflitam(
            novaReserva.data_inicio,
            novaReserva.data_fim,
            reserva.data_inicio,
            reserva.data_fim
        );
    });
}
