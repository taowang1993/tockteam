import { createUserMessage, } from '@deepseek-ai/dsh-llm';
import { deepFreeze } from '@deepseek-ai/dsh-util-values';
import { buildAssistantPrompt, redactBoundaryText, } from "./context.js";
const MAX_OUTPUT_CHARS = 32_000;
const MAX_BUFFERED_CHARS = 100_000;
const MAX_STREAM_CHUNKS = 10_000;
const MAX_REASONING_CHARS = 100_000;
const MAX_TOKENS = 2_048;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/~-]{0,255}$/u;
const ERROR_MESSAGES = {
    ABORTED: 'The assistant turn was cancelled.',
    INVALID_INPUT: 'The assistant turn input is invalid.',
    INVALID_STREAM: 'The model provider returned an invalid stream.',
    PROVIDER_ERROR: 'The model provider could not complete this turn.',
    PROVIDER_UNAVAILABLE: 'The selected model provider is not active.',
    STALE_CONTEXT: 'The vault, child, or assistant turn changed.',
    TOOLS_UNAVAILABLE: 'The model requested a tool that is not available for this turn.',
};
class TurnFailure extends Error {
    code;
    constructor(code) {
        super(ERROR_MESSAGES[code]);
        this.name = 'TurnFailure';
        this.code = code;
    }
}
function fail(code) {
    throw new TurnFailure(code);
}
function eventFor(code) {
    return Object.freeze({ type: 'error', code, message: ERROR_MESSAGES[code] });
}
function snapshotBinding(value) {
    if (typeof value !== 'object'
        || value === null
        || Array.isArray(value)
        || !IDENTIFIER_PATTERN.test(value.vaultId)
        || !IDENTIFIER_PATTERN.test(value.childInstanceId)
        || !IDENTIFIER_PATTERN.test(value.turnId)
        || !Number.isSafeInteger(value.vaultGeneration)
        || value.vaultGeneration < 1)
        fail('INVALID_INPUT');
    return Object.freeze({
        vaultId: value.vaultId,
        vaultGeneration: value.vaultGeneration,
        childInstanceId: value.childInstanceId,
        turnId: value.turnId,
    });
}
function assertRoute(provider, model) {
    if (!IDENTIFIER_PATTERN.test(provider) || !IDENTIFIER_PATTERN.test(model))
        fail('INVALID_INPUT');
}
function stablePrefixLength(value) {
    const tokens = [...value.matchAll(/\S+/gu)];
    if (tokens.length <= 3)
        return 0;
    const cut = tokens[tokens.length - 3].index;
    const prefix = value.slice(0, cut);
    const danglingSecretPrefix = /(?:\bBearer|\b(?:api[_-]?key|access[_-]?token|password|secret|token)\s*[:=])\s*$/iu.exec(prefix);
    return danglingSecretPrefix?.index ?? cut;
}
class StreamingOutput {
    pending = '';
    emittedChars = 0;
    receivedChars = 0;
    append(value) {
        const remainingInput = Math.max(0, MAX_BUFFERED_CHARS - this.receivedChars);
        this.receivedChars += value.length;
        this.pending += value.slice(0, remainingInput);
        const cut = stablePrefixLength(this.pending);
        const text = cut === 0 ? '' : this.pending.slice(0, cut);
        if (cut > 0)
            this.pending = this.pending.slice(cut);
        const emitted = this.emit(text);
        return {
            text: emitted.text,
            truncated: emitted.truncated || this.receivedChars > MAX_BUFFERED_CHARS,
        };
    }
    finish() {
        const pending = this.pending;
        this.pending = '';
        const emitted = this.emit(pending);
        return {
            text: emitted.text,
            truncated: emitted.truncated || this.receivedChars > MAX_BUFFERED_CHARS,
        };
    }
    emit(value) {
        if (value.length === 0)
            return { text: '', truncated: false };
        const redacted = redactBoundaryText(value);
        const remaining = MAX_OUTPUT_CHARS - this.emittedChars;
        if (remaining <= 0)
            return { text: '', truncated: true };
        if (redacted.length <= remaining) {
            this.emittedChars += redacted.length;
            return { text: redacted, truncated: false };
        }
        const text = remaining === 1 ? '…' : `${redacted.slice(0, remaining - 1)}…`;
        this.emittedChars = MAX_OUTPUT_CHARS;
        return { text, truncated: true };
    }
}
function isValidIndex(value) {
    return Number.isSafeInteger(value) && value >= 0;
}
function nextWithAbort(promise, signal) {
    if (signal.aborted)
        return Promise.reject(new TurnFailure('ABORTED'));
    return new Promise((resolve, reject) => {
        const aborted = () => reject(new TurnFailure('ABORTED'));
        signal.addEventListener('abort', aborted, { once: true });
        promise.then(value => {
            signal.removeEventListener('abort', aborted);
            resolve(value);
        }, error => {
            signal.removeEventListener('abort', aborted);
            reject(error);
        });
    });
}
export class AssistantTextTurnRunner {
    llm;
    isCurrent;
    constructor(llm, isCurrent) {
        this.llm = llm;
        this.isCurrent = isCurrent;
    }
    async *run(input, signal) {
        let iterator = null;
        try {
            assertRoute(input.provider, input.model);
            const binding = snapshotBinding(input.binding);
            this.assertCurrent(binding);
            if (signal.aborted)
                fail('ABORTED');
            const providers = this.llm.listProviders();
            if (!providers.some(provider => provider.id === input.provider))
                fail('PROVIDER_UNAVAILABLE');
            let prompt;
            try {
                prompt = buildAssistantPrompt(input.prompt);
            }
            catch {
                fail('INVALID_INPUT');
            }
            const prepared = await nextWithAbort(this.llm.prepareCall({
                provider: input.provider,
                model: input.model,
                maxTokens: MAX_TOKENS,
            }, signal), signal);
            this.assertCurrent(binding);
            const request = deepFreeze({
                ...prepared.config,
                system: prompt.system,
                messages: [createUserMessage({
                        content: [{ type: 'text', text: prompt.user }],
                        source: { kind: 'user' },
                    })],
                signal,
            });
            iterator = prepared.stream(request)[Symbol.asyncIterator]();
            const output = new StreamingOutput();
            let reasoningChars = 0;
            for (let chunkCount = 0; chunkCount < MAX_STREAM_CHUNKS; chunkCount += 1) {
                const item = await nextWithAbort(Promise.resolve(iterator.next()), signal);
                if (item.done)
                    fail('INVALID_STREAM');
                this.assertCurrent(binding);
                const chunk = item.value;
                if (chunk.type === 'text-delta') {
                    if (!isValidIndex(chunk.index) || typeof chunk.text !== 'string')
                        fail('INVALID_STREAM');
                    const emitted = output.append(chunk.text);
                    if (emitted.text.length > 0)
                        yield Object.freeze({ type: 'text-delta', text: emitted.text });
                    if (emitted.truncated) {
                        yield Object.freeze({ type: 'finish', reason: 'max-output', truncated: true });
                        return;
                    }
                    continue;
                }
                if (chunk.type === 'reasoning-delta') {
                    if (!isValidIndex(chunk.index) || typeof chunk.text !== 'string')
                        fail('INVALID_STREAM');
                    reasoningChars += chunk.text.length;
                    if (reasoningChars > MAX_REASONING_CHARS)
                        fail('INVALID_STREAM');
                    continue;
                }
                if (chunk.type === 'tool-call-delta')
                    fail('TOOLS_UNAVAILABLE');
                if (chunk.type === 'block-start') {
                    if (!isValidIndex(chunk.index))
                        fail('INVALID_STREAM');
                    if (chunk.blockType === 'tool-call')
                        fail('TOOLS_UNAVAILABLE');
                    if (chunk.blockType !== 'text' && chunk.blockType !== 'reasoning')
                        fail('INVALID_STREAM');
                    continue;
                }
                if (chunk.type === 'block-end') {
                    if (!isValidIndex(chunk.index) || typeof chunk.block !== 'object' || chunk.block === null) {
                        fail('INVALID_STREAM');
                    }
                    if (chunk.block.type === 'tool-call' || chunk.block.type === 'tool-result') {
                        fail('TOOLS_UNAVAILABLE');
                    }
                    if (chunk.block.type !== 'text' && chunk.block.type !== 'reasoning')
                        fail('INVALID_STREAM');
                    continue;
                }
                if (chunk.type === 'usage')
                    continue;
                if (chunk.type !== 'finish')
                    fail('INVALID_STREAM');
                if (chunk.reason.kind === 'tool-calls')
                    fail('TOOLS_UNAVAILABLE');
                if (chunk.reason.kind === 'aborted')
                    fail('ABORTED');
                if (chunk.reason.kind === 'error')
                    fail('PROVIDER_ERROR');
                if (chunk.reason.kind !== 'stop' && chunk.reason.kind !== 'max-tokens')
                    fail('INVALID_STREAM');
                this.assertCurrent(binding);
                const emitted = output.finish();
                if (emitted.text.length > 0)
                    yield Object.freeze({ type: 'text-delta', text: emitted.text });
                yield Object.freeze({
                    type: 'finish',
                    reason: emitted.truncated ? 'max-output' : chunk.reason.kind,
                    truncated: emitted.truncated,
                });
                return;
            }
            fail('INVALID_STREAM');
        }
        catch (error) {
            const code = error instanceof TurnFailure
                ? error.code
                : signal.aborted
                    ? 'ABORTED'
                    : 'PROVIDER_ERROR';
            yield eventFor(code);
        }
        finally {
            if (iterator?.return !== undefined)
                await iterator.return().catch(() => undefined);
        }
    }
    assertCurrent(binding) {
        try {
            if (this.isCurrent(binding))
                return;
        }
        catch {
            fail('STALE_CONTEXT');
        }
        fail('STALE_CONTEXT');
    }
}
//# sourceMappingURL=text-turn.js.map