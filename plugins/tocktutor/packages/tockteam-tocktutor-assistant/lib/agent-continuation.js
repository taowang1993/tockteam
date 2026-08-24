import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { boundToolText, redactBoundaryText } from "./context.js";
const MAX_INPUT_CHARS = 100_000;
const MAX_MESSAGE_CHARS = 32_000;
const AGENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const SOURCE = Object.freeze({
    kind: 'plugin',
    plugin: 'tocktutor-assistant',
    form: 'notice',
    summary: 'TockTutor Assistant Continuation',
});
const ERROR_MESSAGES = {
    ABORTED: 'The assistant continuation was cancelled.',
    AGENT_NOT_LIVE: 'The selected agent is not live.',
    AGENT_REQUIRED: 'An initiating or explicit live agent is required.',
    DELIVERY_FAILED: 'The existing agent could not accept the continuation.',
    IDENTITY_MISMATCH: 'The explicit agent does not match the initiating agent.',
    IDENTITY_UNAUTHORIZED: 'The explicit agent identity was not authorized.',
    INVALID_REQUEST: 'The assistant continuation request is invalid.',
    REGISTRY_UNAVAILABLE: 'The agent registry is unavailable.',
};
export class AgentContinuationError extends Error {
    code;
    constructor(code) {
        super(ERROR_MESSAGES[code]);
        this.name = 'AgentContinuationError';
        this.code = code;
    }
}
export function isAssistantContinuationMessage(message) {
    const source = message.source;
    if (typeof source !== 'object' || source === null || Array.isArray(source))
        return false;
    const value = source;
    return value.kind === SOURCE.kind
        && value.plugin === SOURCE.plugin
        && value.form === SOURCE.form
        && value.summary === SOURCE.summary;
}
function failure(code) {
    return new AgentContinuationError(code);
}
function parseRequest(value) {
    try {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
            throw failure('INVALID_REQUEST');
        }
        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null)
            throw failure('INVALID_REQUEST');
        const descriptors = Object.getOwnPropertyDescriptors(value);
        const keys = Object.keys(descriptors);
        if (keys.some(key => key !== 'agentId' && key !== 'mode' && key !== 'text')
            || keys.some(key => !Object.hasOwn(descriptors[key] ?? {}, 'value')))
            throw failure('INVALID_REQUEST');
        const input = value;
        if ((input.mode !== 'followup' && input.mode !== 'inject' && input.mode !== 'steer')
            || typeof input.text !== 'string'
            || input.text.length < 1
            || input.text.length > MAX_INPUT_CHARS
            || !input.text.trim()
            || input.text.includes('\0')
            || (input.agentId !== undefined && (typeof input.agentId !== 'string' || !AGENT_ID_PATTERN.test(input.agentId))))
            throw failure('INVALID_REQUEST');
        return Object.freeze({
            ...input.agentId === undefined ? {} : { agentId: input.agentId },
            mode: input.mode,
            text: input.text,
        });
    }
    catch (error) {
        if (error instanceof AgentContinuationError)
            throw error;
        throw failure('INVALID_REQUEST');
    }
}
export class AgentContinuationRouter {
    agents;
    authorizeExplicit;
    constructor(agents, authorizeExplicit) {
        this.agents = agents;
        this.authorizeExplicit = authorizeExplicit;
    }
    route(value, signal, beforeDelivery) {
        const request = parseRequest(value);
        if (signal.aborted)
            throw failure('ABORTED');
        const agent = this.resolveAgent(request.agentId);
        if (signal.aborted)
            throw failure('ABORTED');
        const redactedText = redactBoundaryText(request.text);
        const text = boundToolText(request.text, MAX_MESSAGE_CHARS);
        const message = createUserMessage({
            content: [{ type: 'text', text }],
            source: SOURCE,
        });
        const rollback = beforeDelivery?.(agent, message);
        if (signal.aborted) {
            rollback?.();
            throw failure('ABORTED');
        }
        try {
            switch (request.mode) {
                case 'followup':
                    agent.followup(message);
                    break;
                case 'inject':
                    agent.inject(message);
                    break;
                case 'steer':
                    agent.steer(message);
                    break;
            }
        }
        catch {
            rollback?.();
            throw failure('DELIVERY_FAILED');
        }
        return Object.freeze({
            agentId: agent.id,
            messageId: message.id,
            mode: request.mode,
            redacted: redactedText !== request.text,
            truncated: redactedText.length > MAX_MESSAGE_CHARS,
        });
    }
    resolveAgent(explicitId) {
        let ambient;
        let explicit;
        try {
            ambient = this.agents.currentInitiator();
            explicit = explicitId === undefined
                ? undefined
                : this.agents.get(explicitId);
        }
        catch {
            throw failure('REGISTRY_UNAVAILABLE');
        }
        if (explicitId !== undefined && explicit === undefined)
            throw failure('AGENT_NOT_LIVE');
        if (ambient !== undefined && explicit !== undefined && ambient !== explicit) {
            throw failure('IDENTITY_MISMATCH');
        }
        if (explicitId !== undefined && explicit !== undefined && ambient !== explicit) {
            let authorized = false;
            try {
                authorized = this.authorizeExplicit?.(explicitId, explicit) === true;
            }
            catch {
                authorized = false;
            }
            if (!authorized)
                throw failure('IDENTITY_UNAUTHORIZED');
        }
        const agent = explicit ?? ambient;
        if (agent === undefined)
            throw failure('AGENT_REQUIRED');
        try {
            if (this.agents.get(agent.id) !== agent
                || agent.session.id !== agent.id
                || (agent.status !== 'idle' && agent.status !== 'running'))
                throw failure('AGENT_NOT_LIVE');
        }
        catch (error) {
            if (error instanceof AgentContinuationError)
                throw error;
            throw failure('REGISTRY_UNAVAILABLE');
        }
        return agent;
    }
}
//# sourceMappingURL=agent-continuation.js.map