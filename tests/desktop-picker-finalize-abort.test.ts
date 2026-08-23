import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DesktopPickerOwner } from "../src/desktop-picker-owner.ts";
import {
  computeDesktopDestinationPlanDigest,
  type NativeOperationIdentity,
} from "../src/host-contract.ts";
async function temp(p: string) {
  return await realpath(await mkdtemp(join(tmpdir(), p)));
}
function identity(op: string, active = true): NativeOperationIdentity {
  return {
    operationId: op,
    requestId: `r-${op}`,
    sessionId: "s",
    vaultGeneration: active ? 1 : 0,
    vaultId: active ? "v" : null,
    windowId: "w",
  };
}
async function activate(o: DesktopPickerOwner) {
  const i = identity("activate", false);
  const p = await o.pick(
    { identity: i, kind: "vault", purpose: "activate" },
    new AbortController().signal,
  );
  assert.equal(p.status, "selected");
  if (p.status !== "selected") throw 0;
  const c = await o.consumeVaultSelection(
    { authorization: p.authorization, identity: i },
    new AbortController().signal,
  );
  assert.equal(c.status, "consumed");
  if (c.status !== "consumed") throw 0;
  assert.equal(
    (
      await o.bindVaultSelection(
        {
          claim: c.claim,
          operationId: i.operationId,
          vaultGeneration: 1,
          vaultId: "v",
        },
        new AbortController().signal,
      )
    ).status,
    "bound",
  );
}

test("finalize honors abort at journal-prepared before replacement", async () => {
  const root = await temp("c13-finalize-abort-root-");
  const vault = await temp("c13-finalize-abort-vault-");
  const output = join(root, "out.html");
  const old = Buffer.from("old");
  const next = Buffer.from("new confidential");
  await writeFile(output, old);
  const controller = new AbortController();
  const owner = new DesktopPickerOwner({
    isAvailable: () => true,
    showOpenDialog: async () => ({ canceled: false, filePath: vault }),
    showSaveDialog: async () => ({ canceled: false, filePath: output }),
    onCheckpoint: async (checkpoint) => {
      if (checkpoint === "journal-prepared") controller.abort();
    },
  });
  await activate(owner);
  const id = identity("replace");
  const picked = await owner.pick(
    { identity: id, kind: "destination", purpose: "export-html" },
    new AbortController().signal,
  );
  assert.equal(picked.status, "selected");
  if (picked.status !== "selected") throw 0;
  const plan = {
    entries: [
      {
        digest: createHash("sha256").update(next).digest("hex") as never,
        size: next.length,
        target: { kind: "selected-file" as const },
      },
    ] as const,
    purpose: "export-html" as const,
    totalBytes: next.length,
  };
  const planDigest = computeDesktopDestinationPlanDigest(plan);
  const locked = await owner.lockDestinationPlan(
    {
      ...plan,
      identity: id,
      planDigest,
      selectionAuthorization: picked.authorization,
    },
    new AbortController().signal,
  );
  const begun = await owner.beginDestination(
    { ...plan, authorization: locked.authorization, identity: id, planDigest },
    new AbortController().signal,
  );
  await owner.writeDestinationChunk(
    {
      bytes: next,
      offset: 0,
      planDigest,
      session: begun.session,
      target: { kind: "selected-file" },
    },
    new AbortController().signal,
  );
  await assert.rejects(
    owner.finalizeDestination(
      {
        expectedState: begun.expectedState,
        planDigest,
        session: begun.session,
      },
      controller.signal,
    ),
    (cause: unknown) => (cause as { code?: string }).code === "aborted",
  );
  assert.equal(controller.signal.aborted, true);
  assert.deepEqual(await readFile(output), old);
  await owner.dispose();
});
