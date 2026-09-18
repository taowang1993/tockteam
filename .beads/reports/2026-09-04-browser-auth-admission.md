# Browser Subscription Sign-In Admission Review

## Decision Evidence

- Package: `@deepseek-harness-tui/dsh-auth`
- Exact revision: `94fdf81e775e8d884af4dfb64a94b617c3751936`
- Runtime cohort: DSH `0.1.2-rc.1`, dsh-TUI `v0.10.0-beta.5`
- Decision: **Defer Desktop/Web admission. Keep the existing TUI-only mount.**
- Human approval: `Keep It TUI-Only` selected on 2026-09-04
- Source/profile changes: none

## Blocking Findings

1. The package manifest requires `user-questions.dsh/v1alpha1#UserQuestions`, but the reviewed v0.15 ecosystem registry exposes `presentation.dsh/v1alpha1#UserInteraction`. The admission validator rejects unknown requirement coordinates.
2. Credential serialization is per provider while one cached document stores every provider. Concurrent writes for different providers can overwrite one another; logout also does not serialize against an in-flight login.
3. Manual authorization-code questions are not requested as redacted input. Codes can therefore enter question summaries/transcripts.
4. Raw provider error messages reach `/auth` and TUI surfaces. Adapter errors may contain raw HTTP bodies or serialized response data.
5. Storage methods ignore the abort options accepted by the adapter contract, so canceled refresh or write work can still commit.
6. Stored OAuth credentials accept empty access/refresh strings and non-positive finite expirations.

These are Host credential-integrity and secret-disclosure issues, not browser presentation defects. TockTeam must not work around them with a custom OAuth layer or browser secret bridge.

## Positive Evidence

- Provider catalog resolution stays adapter-owned.
- Metadata and status paths do not return token fields.
- Non-OAuth credential writes are rejected.
- The existing bundle injection is entry-level and TUI-scoped.

## Reviewed Commands

```sh
git -C upstream/dsh-TUI/dsh-auth rev-parse HEAD
# 94fdf81e775e8d884af4dfb64a94b617c3751936

git -C upstream/dsh-TUI/dsh-auth status --short
# clean
```

The review also traced `dsh-plugin.json`, `src/credentials.ts`, `src/interaction.ts`, `src/index.ts`, `src/service.ts`, command and provider-wizard error paths, the pinned pi-ai OAuth adapter, the ecosystem registry, and the admission validator.

## Deferred Verification

Because the static review found release-blocking defects, no real account authorization, credential mutation, profile composition, or standalone Web packaging was attempted. Upstream verification, disposable concurrency/cancellation probes, Windows rename behavior, and a real prompt canceled before authorization remain required after a fixed exact revision is proposed.

## Reconsideration Gate

Reconsider Desktop/Web admission only after an exact newer revision fixes the six findings above and passes the full credential, redaction, headless, packaging, and canceled-login checks. Until then, `tockteam-mlm.13` must remain blocked.
