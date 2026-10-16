const TIMEZONE = process.env.APP_TIMEZONE || 'America/Sao_Paulo';

function first(value) {
    return Array.isArray(value) ? value[value.length - 1] : value;
}

function makeParams() {
    const params = [];
    const add = (value) => {
        params.push(value);
        return `$${params.length}`;
    };
    return { params, add };
}

function escapeLike(text) {
    return text.replace(/[\\%_]/g, '\\$&');
}

function parsePagination(query, { defaultLimit = 20, maxLimit = 100 } = {}) {
    const read = (raw, fallback, name) => {
        if (raw === undefined) return { value: fallback };
        const n = Number(raw);
        if (!/^\d+$/.test(String(raw)) | !Number.isSafeInteger(n) || n < 1) {
            return { error: `${name} deve ser um inteiro maior que zero` };
        }
        return { value: n };
    };

    const page = read(first(query.page), 1, 'page');
    if (page.error) return { error: page.error };
    const limit = read(first(query.limit), defaultLimit, 'limit');
    if (limit.error) return { error: limit.error };

    const size = Math.min(limit.value, maxLimit);
    return { page: page.value, limit: size, offset: (page.value - 1) * size };
}

function paginated(rows, total, { page, limit }) {
    return {
        data: rows,
        pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
    };
}

function parsePeriod(query) {
    const result = {};
    for (const name of ['from', 'to']) {
        const value = first(query[name]);
        if (value === undefined) continue;
        const date = new Date(`${value}T00:00:00Z`);
        const valid =
            /^\d{4}-\d{2}$/.test(value) &&
            !Number.isNaN(date.getTime()) &&
            date.toISOString().slice(0, 10) === value;
        if (!valid) return { error: `${name} deve ser uma data válida no formato AAAA-MM-DD` };
        result[name] = value;
    }
    if (result.from && result.to && result.from > result.to) {
        return { error: 'from não pode ser posterior a to' };
    }
    return result;
}

function periodConditions(column, { from, to }, add) {
    const conditions = [];
    if (from) {
        conditions.push(`${column} >= (${add(from)}::date)::timestamp AT TIME ZONE ${add(TIMEZONE)}`);
    }
    if (to) {
        conditions.push(`${column} < (${add(to)}::date + 1)::timestamp AT TIME ZONE ${add(TIMEZONE)}`);
    }
    return conditions;
}

module.exports = { first, makeParams, escapeLike, parsePagination, paginated, parsePeriod, periodConditions };