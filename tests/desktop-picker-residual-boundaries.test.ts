import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DesktopPickerChannel } from "../src/desktop-picker-channel.ts";
import { DesktopPickerOwner } from "../src/desktop-picker-owner.ts";
import { DesktopPickerProvider } from "../src/desktop-picker-provider.ts";
import {
  computeDesktopDestinationPlanDigest,
  type NativeOperationIdentity,
} from "../src/host-contract.ts";

async function temp(prefix: string): Promise<string> {
  return await realpath(await mkdtemp(join(tmpdir(), prefix)));
}
function identity(operationId: string, active = true): NativeOperationIdentity {
  return {
    operationId,
    requestId: `r-${operationId}`,
    sessionId: "s",
    vaultGeneration: active ? 1 : 0,
    vaultId: active ? "v" : null,
    windowId: "w",
  };
}
async function activate(owner: DesktopPickerOwner): Promise<string> {
  const id = identity("activate", false);
  const pick = await owner.pick(
    { identity: id, kind: "vault", purpose: "activate" },
    new AbortController().signal,
  );
  assert.equal(pick.status, "selected");
  if (pick.status !== "selected") throw 0;
  const consumed = await owner.consumeVaultSelection(
    { authorization: pick.authorization, identity: id },
    new AbortController().signal,
  );
  assert.equal(consumed.status, "consumed");
  if (consumed.status !== "consumed") throw 0;
  assert.equal(
    (
      await owner.bindVaultSelection(
        {
          claim: consumed.claim,
          operationId: id.operationId,
          vaultGeneration: 1,
          vaultId: "v",
        },
        new AbortController().signal,
      )
    ).status,
    "bound",
  );
  return consumed.claim;
}
function planFor(bytes: Uint8Array) {
  const plan = {
    entries: [
      {
        digest: createHash("sha256").update(bytes).digest("hex") as never,
        size: bytes.byteLength,
        target: { kind: "selected-file" as const },
      },
    ] as const,
    purpose: "export-html" as const,
    totalBytes: bytes.byteLength,
  };
  return { plan, planDigest: computeDesktopDestinationPlanDigest(plan) };
}

async function existingFixture(prefix: string, now?: () => number) {
  const root = await temp(`${prefix}-root-`);
  const recoveryRoot = await temp(`${prefix}-recovery-`);
  const vault = await temp(`${prefix}-vault-`);
  const output = join(root, "out.html");
  const owner = new DesktopPickerOwner({
    isAvailable: () => true,
    recoveryRoot,
    ...(now === undefined ? {} : { now }),
    showOpenDialog: async () => ({ canceled: false, filePath: vault }),
    showSaveDialog: async () => ({ canceled: false, filePath: output }),
  });
  await activate(owner);
  const id = identity(prefix);
  const selected = await owner.pick(
    { identity: id, kind: "destination", purpose: "export-html" },
    new AbortController().signal,
  );
  assert.equal(selected.status, "selected");
  if (selected.status !== "selected") throw 0;
  const bytes = Buffer.from("new");
  const { plan, planDigest } = planFor(bytes);
  const locked = await owner.lockDestinationPlan(
    {
      ...plan,
      identity: id,
      planDigest,
      selectionAuthorization: selected.authorization,
    },
    new AbortController().signal,
  );
  return {
    root,
    recoveryRoot,
    output,
    owner,
    id,
    bytes,
    plan,
    planDigest,
    locked,
  };
}

test("expired destination plan creates no artifacts", async () => {
  let now = 0;
  const f = await existingFixture("c16-expired-plan", () => now);
  now = f.locked.expiresAt + 1;
  await assert.rejects(
    f.owner.beginDestination({ ...f.plan, authorization: f.locked.authorization, identity: f.id, planDigest: f.planDigest }, new AbortController().signal),
    (cause: unknown) => (cause as { code?: string }).code === "expired",
  );
  assert.equal((await readdir(f.root)).some(name => name.startsWith(".tockteam-picker-")), false);
  assert.deepEqual(await readdir(f.recoveryRoot), []);
  assert.equal((await f.owner.revokeDestinationPlan({ authorization: f.locked.authorization })).status, "already-closed");
  await f.owner.dispose();
});

test("parent replacement at begin creates no confidential artifacts", async () => {
  const f = await existingFixture("c16-parent-begin");
  const moved = `${f.root}-moved`;
  await rename(f.root, moved);
  await mkdir(f.root);
  await assert.rejects(
    f.owner.beginDestination({ ...f.plan, authorization: f.locked.authorization, identity: f.id, planDigest: f.planDigest }, new AbortController().signal),
    (cause: unknown) => (cause as { code?: string }).code === "unsafe-target",
  );
  assert.deepEqual(await readdir(moved), []);
  assert.deepEqual(await readdir(f.recoveryRoot), []);
  await f.owner.dispose();
});

test("lost finalize response uses the published success tombstone during disposal", async () => {
  const root = await temp("c13-finalize-response-root-");
  const vault = await temp("c13-finalize-response-vault-");
  const output = join(root, "out.html");
  const bytes = Buffer.from("final output");
  const owner = new DesktopPickerOwner({
    isAvailable: () => true,
    showOpenDialog: async () => ({ canceled: false, filePath: vault }),
    showSaveDialog: async () => ({ canceled: false, filePath: output }),
  });
  await activate(owner);
  const channel = new DesktopPickerChannel(owner);
  const provider = new DesktopPickerProvider(
    await channel.start(),
    fetch,
    () => ({ active: true, generation: 1, id: "v" }),
  );
  const id = identity("finalize-response");
  const selected = await provider.pick(
    { identity: id, kind: "destination", purpose: "export-html" },
    new AbortController().signal,
  );
  assert.equal(selected.status, "selected");
  if (selected.status !== "selected") throw 0;
  const { plan, planDigest } = planFor(bytes);
  const locked = await provider.lockDestinationPlan(
    {
      ...plan,
      identity: id,
      planDigest,
      selectionAuthorization: selected.authorization,
    },
    new AbortController().signal,
  );
  const begun = await provider.beginDestination(
    { ...plan, authorization: locked.authorization, identity: id, planDigest },
    new AbortController().signal,
  );
  await provider.writeDestinationChunk(
    {
      bytes,
      offset: 0,
      planDigest,
      session: begun.session,
      target: { kind: "selected-file" },
    },
    new AbortController().signal,
  );
  let published!: () => void;
  const publishedPromise = new Promise<void>((resolve) => {
    published = resolve;
  });
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const originalFinalize = owner.finalizeDestination.bind(owner);
  owner.finalizeDestination = (async (request, signal) => {
    const result = await originalFinalize(request, signal);
    assert.equal(result.status, "published");
    published();
    await blocked;
    return result;
  }) as typeof owner.finalizeDestination;
  const controller = new AbortController();
  const finalizing = provider.finalizeDestination(
    { expectedState: begun.expectedState, planDigest, session: begun.session },
    controller.signal,
  );
  await publishedPromise;
  controller.abort();
  release();
  await assert.rejects(finalizing);
  assert.deepEqual(await readFile(output), bytes);
  await provider.dispose();
  await channel.stop().catch(() => undefined);
});
