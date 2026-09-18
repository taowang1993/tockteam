# A Development Philosophy for Self-Evolving Systems: Reversible Change, Explicit Dependencies, and Continuous Recovery

## Purpose

This philosophy proposes a way to build software from parts that can be added, removed, replaced, or reconfigured while the program keeps running. Its goal is to make these changes safe and predictable instead of requiring a full restart.

This philosophy focuses on two promises:

1. **Safe change over time:** when a part is removed, the resources and changes it introduced are cleaned up.
2. **Safe connections between parts:** when a part needs another part, the system notices when that dependency appears, disappears, or is replaced, and responds in the right order.

Together, these are called **spatiotemporal composability**. In simpler terms, the system understands both *when* parts come and go and *how* they fit together.

## The Problem

Most plugin systems can load new features, but removing one often means restarting the whole host. That interrupts other work, loses in-memory state, and can make recovery harder. Cleanup is usually left to each plugin author, so forgotten listeners, timers, files, connections, or registrations may remain behind.

Dependencies are often handled just as loosely. A component may try to use a service that is not available, or continue using an old service after it has been replaced. Developers then have to write special cases to detect and repair these situations.

This philosophy treats process restarts and container orchestration as useful but too coarse. They manage whole processes or services when modern applications increasingly need to change smaller pieces.

## Development Principles

The approach turns every interaction with the shared environment into a managed operation.

### Every change has a way back

When a component changes something, it also provides a matching way to undo that change. The system remembers these undo actions and combines them in reverse order. Removing the component then runs its remembered cleanup automatically.

This makes cleanup local: the code that performs a change supplies the information needed to reverse it. Larger operations can be assembled from smaller ones without requiring a separate, hand-written shutdown plan for every combination.

The guarantee is about the state the system controls. For example, it can normally undo a private registration, listener, temporary file, or resource handle. It cannot magically erase something already sent to another program or person.

### Components declare what they need

A component states which services or values it needs and which ones it can provide. The runtime watches these connections continuously:

- a component starts when all its needs are available;
- it stops when a needed service disappears or changes;
- a replacement is treated as a real change, even if it happens to provide an equal-looking value;
- a provider stops supplying its services before it begins final cleanup, so dependents can shut down first while they can still use those services.

This avoids making every component repeatedly check whether its dependencies are usable.

The model also supports private versions of a dependency for different parts of an application and allows an enclosing context to add rules around how a dependency is used. These features are useful for testing, multi-tenant systems, and access control.

## Promises and Conditions

The approach gives a precise model of components, their dependencies, their cleanup actions, and their life cycles. It supports several promises under stated conditions:

- a component can recover the changes it made;
- independent components can be removed in different orders without damaging one another;
- components start only after their dependencies are ready;
- providers remain available long enough for their dependents to finish shutting down;
- long-running or asynchronous changes are allowed to finish before the system responds to a new change;
- a failed component is cleaned up and kept from being retried automatically;
- when changes settle, the final state does not depend on the order in which unrelated lifecycle steps ran.

These guarantees depend on discipline. Components must keep their changes inside the managed context, provide honest undo actions, avoid dependency cycles, and use interfaces whose operations are safe to combine. These guarantees do not cover arbitrary outside-world effects.

## Reference Implementations

**[Cordis](https://github.com/cordiverse/cordis)** demonstrates these ideas as a general framework for dynamic composition. Its main building blocks are:

- an effect mechanism that records cleanup actions;
- dependency registration and lookup;
- automatic notifications when services change;
- component life cycles that load, unload, retry only when explicitly allowed, and handle asynchronous work;
- nested components, so a parent can manage children;
- declarative configuration that can be updated incrementally;
- hot module replacement that reloads changed code as a transaction and restores the previous version if the new one fails.

A practical example is **Koishi**, a chatbot framework with more than 4,000 community plugins. Plugins can be disabled without restarting unrelated features, and plugins can react to providers being added, removed, or replaced. This is evidence that the approach works in a large, open plugin ecosystem, while not being a controlled performance comparison.

## Important Limits

The approach is not a universal undo button.

- Data sent over a network, messages shown to users, and other outside effects usually cannot be taken back. They must be delayed until safe or compensated for later.
- The framework records cleanup, but it generally cannot prove that a developer’s undo action is correct.
- Circular dependencies remain inactive rather than being resolved automatically.
- Components built independently still need compatible interfaces, names, and versions.
- Language-level dependency checks are not a security sandbox. Untrusted code still needs a separate process, restricted runtime, or similar boundary.
- The design removes and rebuilds a component rather than automatically carrying its private in-memory state into a new version. State migration is left as future work.

## Implications for Self-Evolving Agent Harnesses

A central use case is an agent harness that can improve or replace parts of itself while continuing to serve requests. A generated tool, memory service, permission layer, or orchestration component could be loaded as a managed component. If it proves faulty, the harness could remove it and recover its controlled resources without restarting everything. Components that depend on it would be notified and reconnected in an orderly way.

**[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)** is a relevant reference point for this kind of long-running agent environment: a harness that evolves while preserving continuity, recovery, and clear boundaries.

The practical lesson is to make self-change small, explicit, reversible, and dependency-aware. The framework does not remove the need for review, version checks, sandboxing, or careful handling of external outputs. It provides the runtime structure needed so that a failed change can be withdrawn instead of becoming a permanent part of the running system.

## Closing Principle

The philosophy can be stated simply: **every runtime change should have a reliable way back, and every dependency should be watched as it changes.** Cordis turns that idea into a framework for live plugin systems. The same pattern can give self-evolving agent systems a safer foundation for continuous change.
