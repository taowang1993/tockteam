import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  readFile,
  readdir,
  realpath,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DesktopPickerOwner } from "../src/desktop-picker-owner.ts";
import {
  computeDesktopDestinationPlanDigest,
  type NativeOperationIdentity,
} from "../src/host-contract.ts";

async function temp(prefix: string) {
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
async function activate(owner: DesktopPickerOwner) {
  const id = identity("activate", false);
  const p = await owner.pick(
    { identity: id, kind: "vault", purpose: "activate" },
    new AbortController().signal,
  );
  assert.equal(p.status, "selected");
  if (p.status !== "selected") throw 0;
  const c = await owner.consumeVaultSelection(
    { authorization: p.authorization, identity: id },
    new AbortController().signal,
  );
  assert.equal(c.status, "consumed");
  if (c.status !== "consumed") throw 0;
  assert.equal(
    (
      await owner.bindVaultSelection(
        {
          claim: c.claim,
          operationId: id.operationId,
          vaultGeneration: 1,
          vaultId: "v",
        },
        new AbortController().signal,
      )
    ).status,
    "bound",
  );
}

test("vault-backup rejects a nested staging symlink without writing outside", async () => {
  const root = await temp("c13-backup-root-");
  const outside = await temp("c13-backup-outside-");
  const vault = await temp("c13-backup-vault-");
  const secret = Buffer.from("escaped backup bytes");
  let linked = false;
  const owner = new DesktopPickerOwner({
    isAvailable: () => true,
    showOpenDialog: async (options) => ({
      canceled: false,
      filePath: options.purpose === "activate" ? vault : root,
    }),
    showSaveDialog: async () => ({ canceled: true }),
    onCheckpoint: async (checkpoint) => {
      if (checkpoint !== "write" || linked) return;
      const stage = (await readdir(root)).find((name) =>
        name.startsWith(".tockteam-picker-stage-"),
      );
      assert.ok(stage);
      await symlink(outside, join(root, stage, "notes"));
      linked = true;
    },
  });
  await activate(owner);
  const id = identity("backup");
  const picked = await owner.pick(
    { identity: id, kind: "destination", purpose: "vault-backup" },
    new AbortController().signal,
  );
  assert.equal(picked.status, "selected");
  if (picked.status !== "selected") throw 0;
  const manifest = Buffer.from('{"version":1}');
  const plan = {
    entries: [
      {
        digest: createHash("sha256").update(manifest).digest("hex") as never,
        size: manifest.length,
        target: {
          kind: "relative-file" as const,
          relativePath: "manifest.json" as never,
        },
      },
      {
        digest: createHash("sha256").update(secret).digest("hex") as never,
        size: secret.length,
        target: {
          kind: "relative-file" as const,
          relativePath: "notes/secret.md" as never,
        },
      },
    ] as const,
    publicationName: "backup" as never,
    purpose: "vault-backup" as const,
    totalBytes: manifest.length + secret.length,
  };
  const planDigest = computeDesktopDestinationPlanDigest(plan);
  await assert.rejects(
    owner.lockDestinationPlan(
      {
        ...plan,
        identity: id,
        planDigest,
        selectionAuthorization: picked.authorization,
      },
      new AbortController().signal,
    ),
    (cause: unknown) => (cause as { code?: string }).code === "unsafe-target",
  );
  assert.equal(linked, false);
  await assert.rejects(readFile(join(outside, "secret.md")));
  await owner.dispose();
});
