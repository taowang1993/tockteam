import { assertSafeRelativePath, redactBoundaryText } from "./context.js";
import { AssistantTextTurnRunner } from "./text-turn.js";
const MAX_EXPANSION_OUTPUT = 16_384;
const MAX_EXPANSIONS = 5;
const MAX_EXPANSION_CHARS = 120;
const MAX_CANDIDATES = 100;
const MAX_QUERY_CHARS = 1_000;
const MAX_DIRECTORY_CHARS = 1_000;
const SEARCH_BINDING = Object.freeze({
    vaultId: 'search-vault',
    vaultGeneration: 1,
    childInstanceId: 'search-intelligence',
    turnId: 'search-intelligence',
});
const MAX_ANSWER_CANDIDATES = 20;
const MAX_ANSWER_CITATIONS = 5;
const MAX_ANSWER_CHARS = 8_000;
const MAX_EXCERPT_CHARS = 2_000;
export function parseSearchExpansion(value) {
    if (value.length > MAX_EXPANSION_OUTPUT)
        throw new TypeError('Search expansion is too large.');
    const parsed = JSON.parse(value);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
        throw new TypeError('Search expansion must be an object.');
    const record = parsed;
    if (Object.keys(record).length !== 1 || !Array.isArray(record.queries) || record.queries.length > MAX_EXPANSIONS) {
        throw new TypeError('Search expansion must contain only a bounded queries array.');
    }
    const queries = record.queries.map(query => {
        if (typeof query !== 'string' || query.length === 0 || query.length > MAX_EXPANSION_CHARS || /[\u0000-\u001f\u007f]/u.test(query)) {
            throw new TypeError('Search expansion query is invalid.');
        }
        const bounded = redactBoundaryText(query).trim();
        if (bounded.length === 0 || bounded.length > MAX_EXPANSION_CHARS)
            throw new TypeError('Search expansion query is invalid.');
        return bounded;
    });
    return [...new Set(queries)];
}
function candidateKey(match) {
    return match.id ?? `${match.path}:${match.kind}:${String(match.line)}:${match.lineEnd ?? ''}:${match.preview}`;
}
function mergeCandidates(pages) {
    const byId = new Map();
    for (const page of pages) {
        for (const match of page.matches) {
            const key = candidateKey(match);
            const previous = byId.get(key);
            if (previous === undefined || (match.score ?? 0) > (previous.score ?? 0))
                byId.set(key, match);
        }
    }
    return [...byId.values()]
        .toSorted((left, right) => (right.score ?? 0) - (left.score ?? 0) || left.path.localeCompare(right.path))
        .slice(0, MAX_CANDIDATES);
}
function boundedSearchRequest(request, query, mode = 'query') {
    const directory = request.directory?.trim();
    if (directory !== undefined && (directory.length > MAX_DIRECTORY_CHARS || directory.includes('\0'))) {
        throw new TypeError('Search directory is invalid.');
    }
    return {
        query,
        mode,
        ...(directory ? { directory } : {}),
        ...(request.modifiedFrom === undefined ? {} : { modifiedFrom: request.modifiedFrom }),
        ...(request.modifiedTo === undefined ? {} : { modifiedTo: request.modifiedTo }),
        ...(request.titleOnly === true ? { titleOnly: true } : {}),
        limit: MAX_CANDIDATES,
    };
}
function assertQuickAnswerCandidates(candidates) {
    if (candidates.length > MAX_ANSWER_CANDIDATES)
        throw new TypeError('Quick Answer candidates exceed their bound.');
    const ids = new Set();
    for (const candidate of candidates) {
        if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(candidate.id) || ids.has(candidate.id))
            throw new TypeError('Quick Answer candidate IDs must be unique and opaque.');
        ids.add(candidate.id);
        assertSafeRelativePath(candidate.path);
        if (candidate.preview.length > 4_096 || (candidate.line !== null && (!Number.isSafeInteger(candidate.line) || candidate.line < 1)) || (candidate.lineEnd !== undefined && candidate.lineEnd !== null && (!Number.isSafeInteger(candidate.lineEnd) || candidate.lineEnd < 1)) || (candidate.line !== null && candidate.lineEnd !== undefined && candidate.lineEnd !== null && candidate.lineEnd < candidate.line)) {
            throw new TypeError('Quick Answer candidate metadata is invalid.');
        }
    }
}
function boundedExcerpt(content, line, lineEnd) {
    const lines = content.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n');
    const start = line === null ? 0 : Math.max(0, line - 1);
    const end = line === null ? Math.min(lines.length, 20) : Math.min(lines.length, lineEnd ?? line);
    const excerpt = lines.slice(start, Math.max(start + 1, end)).join('\n').trim();
    return redactBoundaryText(excerpt).slice(0, MAX_EXCERPT_CHARS);
}
function parseQuickAnswer(value, candidates) {
    if (value.length > MAX_ANSWER_CHARS)
        throw new TypeError('Quick Answer output is too large.');
    const parsed = JSON.parse(value);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
        throw new TypeError('Quick Answer output must be an object.');
    const record = parsed;
    if (Object.keys(record).some(key => key !== 'answer' && key !== 'citations') || typeof record.answer !== 'string' || !Array.isArray(record.citations) || record.citations.length > MAX_ANSWER_CITATIONS)
        throw new TypeError('Quick Answer output is invalid.');
    const seen = new Set();
    const citations = record.citations.map(id => {
        if (typeof id !== 'string' || !candidates.has(id) || seen.has(id))
            throw new TypeError('Quick Answer citation is unknown or duplicated.');
        seen.add(id);
        const candidate = candidates.get(id);
        return { id, path: candidate.path, line: candidate.line, lineEnd: candidate.lineEnd ?? candidate.line };
    });
    const answer = redactBoundaryText(record.answer.trim());
    if (answer.length > MAX_ANSWER_CHARS)
        throw new TypeError('Quick Answer output is too large.');
    return { answer, citations };
}
export async function answerSearchQuery(llm, request, provider, model, read, signal, isCurrent = current => current.vaultGeneration === request.vaultGeneration) {
    if (llm === undefined)
        return { status: 'provider-unavailable', answer: '', citations: [] };
    if (signal.aborted)
        return { status: 'cancelled', answer: '', citations: [] };
    const query = redactBoundaryText(request.query.trim());
    if (query.length === 0 || query.length > MAX_QUERY_CHARS)
        return { status: 'invalid-output', answer: '', citations: [] };
    assertQuickAnswerCandidates(request.candidates);
    if (request.candidates.length === 0)
        return { status: 'no-evidence', answer: '', citations: [] };
    const binding = { ...SEARCH_BINDING, vaultGeneration: request.vaultGeneration };
    const excerpts = [];
    const readByPath = new Map();
    for (const candidate of request.candidates) {
        if (!isCurrent(binding))
            return { status: 'cancelled', answer: '', citations: [] };
        try {
            const pending = readByPath.get(candidate.path) ?? read(candidate.path, signal);
            readByPath.set(candidate.path, pending);
            const document = await pending;
            if (document.path !== candidate.path || typeof document.content !== 'string')
                continue;
            const excerpt = boundedExcerpt(document.content, candidate.line, candidate.lineEnd);
            if (excerpt !== '')
                excerpts.push({ candidate, excerpt });
        }
        catch (error) {
            if (signal.aborted || (error instanceof Error && error.name === 'AbortError'))
                return { status: 'cancelled', answer: '', citations: [] };
        }
    }
    if (excerpts.length === 0)
        return { status: 'no-evidence', answer: '', citations: [] };
    const prompt = [
        'Return strict JSON only with exactly these keys: answer and citations.',
        'Answer the user question using only the note excerpts below. Keep the answer concise.',
        `citations must contain at most ${String(MAX_ANSWER_CITATIONS)} opaque candidate IDs supporting the answer; never emit paths or invent IDs.`,
        `User question: ${query}`,
        ...excerpts.map(({ candidate, excerpt }) => `Candidate ${candidate.id}:\n${excerpt}`),
    ].join('\n\n');
    const completion = await textTurn(llm, provider, model, prompt, binding, signal, isCurrent);
    if (completion.status === 'error')
        return { status: completion.code === 'ABORTED' || completion.code === 'STALE_CONTEXT' ? 'cancelled' : completion.code === 'PROVIDER_UNAVAILABLE' ? 'provider-unavailable' : 'error', answer: '', citations: [] };
    try {
        const parsed = parseQuickAnswer(completion.text, new Map(excerpts.map(({ candidate }) => [candidate.id, candidate])));
        if (parsed.answer === '' || parsed.citations.length === 0)
            return { status: 'no-evidence', answer: '', citations: [] };
        return { status: 'completed', ...parsed };
    }
    catch {
        return { status: 'invalid-output', answer: '', citations: [] };
    }
}
async function textTurn(llm, provider, model, prompt, binding, signal, isCurrent) {
    const runner = new AssistantTextTurnRunner(llm, isCurrent);
    let text = '';
    for await (const event of runner.run({
        binding,
        model,
        provider,
        prompt: { message: prompt },
    }, signal)) {
        if (event.type === 'text-delta')
            text += event.text;
        if (event.type === 'error')
            return { status: 'error', code: event.code };
    }
    return { status: 'ok', text };
}
export async function expandAndSearch(llm, request, provider, model, search, signal, isCurrent = current => current.vaultGeneration === request.vaultGeneration) {
    if (llm === undefined)
        return { status: 'provider-unavailable', matches: [] };
    if (signal.aborted)
        return { status: 'cancelled', matches: [] };
    const query = redactBoundaryText(request.query.trim());
    if (query.length === 0 || query.length > MAX_QUERY_CHARS)
        return { status: 'invalid-output', matches: [] };
    const binding = { ...SEARCH_BINDING, vaultGeneration: request.vaultGeneration };
    const expansion = await textTurn(llm, provider, model, [
        'Return strict JSON only with exactly one key: queries.',
        `queries must be an array of at most ${String(MAX_EXPANSIONS)} short alternate search phrases.`,
        `User query: ${query}`,
    ].join('\n'), binding, signal, isCurrent);
    if (expansion.status === 'error') {
        return { status: expansion.code === 'ABORTED' ? 'cancelled' : expansion.code === 'PROVIDER_UNAVAILABLE' ? 'provider-unavailable' : 'error', matches: [] };
    }
    let queries;
    try {
        queries = parseSearchExpansion(expansion.text);
    }
    catch {
        return { status: 'invalid-output', matches: [] };
    }
    try {
        const pages = [await search(boundedSearchRequest(request, query, 'related'), signal)];
        for (const alternate of queries) {
            if (signal.aborted)
                return { status: 'cancelled', matches: [] };
            pages.push(await search(boundedSearchRequest(request, alternate), signal));
        }
        return { status: 'applied', matches: mergeCandidates(pages) };
    }
    catch (error) {
        if (signal.aborted || (error instanceof Error && error.name === 'AbortError'))
            return { status: 'cancelled', matches: [] };
        return { status: 'error', matches: [] };
    }
}
//# sourceMappingURL=search-intelligence.js.map