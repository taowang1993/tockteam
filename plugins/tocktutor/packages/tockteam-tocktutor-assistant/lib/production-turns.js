import { isAssistantContinuationMessage } from "./agent-continuation.js";
import { AssistantTurnBindingError, } from "./turn-bindings.js";
const MAX_PENDING_MESSAGES = 128;
/** Correlates only Host-minted assistant messages to their exact existing-Agent turn lifecycle. */
export class ProductionAssistantTurnBinder {
    host;
    pending = new Map();
    claimed = new Map();
    binding = new Map();
    invalidatedMessages = new Map();
    invalidatedTurns = new Map();
    active = new Map();
    disposed = false;
    constructor(host) {
        this.host = host;
    }
    reserve(agent, messageId) {
        if (this.disposed
            || this.pending.size + this.claimed.size + this.binding.size + this.invalidatedMessages.size >= MAX_PENDING_MESSAGES
            || this.pending.has(messageId)
            || this.claimed.has(messageId)
            || this.binding.has(messageId)
            || this.invalidatedMessages.has(messageId))
            throw new Error('The assistant turn could not be reserved.');
        this.pending.set(messageId, agent);
        return () => {
            if (this.pending.get(messageId) === agent)
                this.pending.delete(messageId);
            const claim = this.claimed.get(messageId);
            if (claim?.agent === agent)
                this.claimed.delete(messageId);
            const binding = this.binding.get(messageId);
            if (binding?.agent === agent)
                this.binding.delete(messageId);
        };
    }
    onClaimed(agent, message, turn) {
        if (this.disposed || this.pending.get(message.id) !== agent || !isAssistantContinuationMessage(message))
            return;
        this.pending.delete(message.id);
        this.claimed.set(message.id, { agent, message, turn });
    }
    onDiscarded(agent, message) {
        if (this.pending.get(message.id) === agent)
            this.pending.delete(message.id);
        const claim = this.claimed.get(message.id);
        if (claim?.agent === agent)
            this.claimed.delete(message.id);
        const binding = this.binding.get(message.id);
        if (binding?.agent === agent)
            this.binding.delete(message.id);
        if (this.invalidatedMessages.get(message.id) === agent)
            this.invalidatedMessages.delete(message.id);
    }
    async onPreStep(payload, next) {
        const assistantMessages = payload.messages.filter(isAssistantContinuationMessage);
        if (assistantMessages.length === 0)
            return next();
        const submitted = assistantMessages.find(message => {
            const claim = this.claimed.get(message.id);
            return claim?.agent === payload.agent
                && claim.turn === payload.turn
                && claim.message === message;
        });
        if (submitted === undefined
            || assistantMessages.some(message => this.invalidatedMessages.get(message.id) === payload.agent)) {
            for (const message of assistantMessages) {
                this.claimed.delete(message.id);
                this.invalidatedMessages.delete(message.id);
            }
            this.invalidateTurn(payload.agent, payload.turn);
            return { kind: 'reject' };
        }
        const claim = this.claimed.get(submitted.id);
        this.claimed.delete(submitted.id);
        this.binding.set(submitted.id, claim);
        if (this.disposed || payload.signal.aborted) {
            this.binding.delete(submitted.id);
            this.invalidateTurn(payload.agent, payload.turn);
            return { kind: 'reject' };
        }
        let productionBinding;
        try {
            productionBinding = await this.host.bind(payload.agent, payload.turn, submitted.id, payload.signal);
        }
        catch (error) {
            this.binding.delete(submitted.id);
            this.invalidatedMessages.delete(submitted.id);
            this.invalidateTurn(payload.agent, payload.turn);
            if (payload.signal.aborted)
                return { kind: 'reject' };
            throw error;
        }
        this.binding.delete(submitted.id);
        if (this.disposed
            || payload.signal.aborted
            || this.invalidatedMessages.get(submitted.id) === payload.agent) {
            this.invalidatedMessages.delete(submitted.id);
            productionBinding.lease.end();
            this.invalidateTurn(payload.agent, payload.turn);
            return { kind: 'reject' };
        }
        this.endActive(payload.agent);
        const active = {
            agent: payload.agent,
            lease: productionBinding.lease,
            messageId: submitted.id,
            turn: payload.turn,
        };
        this.active.set(payload.agent, active);
        let decision;
        try {
            decision = await next();
        }
        catch (error) {
            this.invalidateTurn(payload.agent, payload.turn);
            this.end(active);
            throw error;
        }
        if (decision.kind === 'reject') {
            this.invalidateTurn(payload.agent, payload.turn);
            this.end(active);
            return decision;
        }
        if (payload.signal.aborted
            || !decision.messages.some(message => message === submitted && message.id === submitted.id)) {
            this.invalidateTurn(payload.agent, payload.turn);
            this.end(active);
            return { kind: 'reject' };
        }
        return decision;
    }
    async onRequest(payload, next) {
        if (this.invalidatedTurns.get(payload.agent)?.has(payload.turn) === true) {
            throw new AssistantTurnBindingError('STALE_TURN');
        }
        const before = this.active.get(payload.agent);
        const config = await next();
        const current = this.active.get(payload.agent);
        if (this.invalidatedTurns.get(payload.agent)?.has(payload.turn) === true) {
            throw new AssistantTurnBindingError('STALE_TURN');
        }
        if (before === undefined)
            return config;
        if (current !== before
            || before.turn !== payload.turn
            || payload.signal.aborted
            || this.disposed)
            throw new AssistantTurnBindingError('STALE_TURN');
        return this.host.requestConfig(payload.agent, payload.turn, payload.signal, config);
    }
    onTurnStopping(agent, turn) {
        const active = this.active.get(agent);
        if (active?.turn === turn)
            this.end(active);
        const turns = this.invalidatedTurns.get(agent);
        turns?.delete(turn);
        if (turns?.size === 0)
            this.invalidatedTurns.delete(agent);
    }
    invalidateAgent(agent) {
        for (const [messageId, pendingAgent] of this.pending) {
            if (pendingAgent !== agent)
                continue;
            this.invalidatedMessages.set(messageId, agent);
            this.pending.delete(messageId);
            this.removeFromInbox(agent, messageId);
        }
        for (const [messageId, claim] of this.claimed) {
            if (claim.agent !== agent)
                continue;
            this.invalidatedMessages.set(messageId, agent);
            this.claimed.delete(messageId);
        }
        for (const [messageId, claim] of this.binding) {
            if (claim.agent === agent)
                this.invalidatedMessages.set(messageId, agent);
        }
        const active = this.active.get(agent);
        if (active !== undefined) {
            this.invalidateTurn(agent, active.turn);
            this.end(active);
        }
    }
    invalidateAll() {
        for (const [messageId, agent] of this.pending) {
            this.invalidatedMessages.set(messageId, agent);
            this.removeFromInbox(agent, messageId);
        }
        for (const [messageId, claim] of this.claimed) {
            this.invalidatedMessages.set(messageId, claim.agent);
        }
        for (const [messageId, claim] of this.binding) {
            this.invalidatedMessages.set(messageId, claim.agent);
        }
        this.pending.clear();
        this.claimed.clear();
        for (const active of [...this.active.values()]) {
            this.invalidateTurn(active.agent, active.turn);
            this.end(active);
        }
    }
    dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        this.invalidateAll();
    }
    invalidateTurn(agent, turn) {
        const turns = this.invalidatedTurns.get(agent) ?? new Set();
        turns.add(turn);
        this.invalidatedTurns.set(agent, turns);
    }
    removeFromInbox(agent, messageId) {
        try {
            agent.inbox.remove(messageId);
        }
        catch {
            // A claimed or custom Agent inbox cannot be removed; its tombstone still rejects later phases.
        }
    }
    endActive(agent) {
        const active = this.active.get(agent);
        if (active !== undefined)
            this.end(active);
    }
    end(active) {
        if (this.active.get(active.agent) === active)
            this.active.delete(active.agent);
        active.lease.end();
    }
}
//# sourceMappingURL=production-turns.js.map