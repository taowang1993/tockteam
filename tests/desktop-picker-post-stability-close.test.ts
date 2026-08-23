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
import { DesktopPickerOwner } from "../src/desktop-picker-owner.ts";
import { computeDesktopDestinationPlanDigest } from "../src/host-contract.ts";
const temp = async (p: string) =>
  await realpath(await mkdtemp(join(tmpdir(), p)));
const id = (op: string, a = true) => ({
  operationId: op,
  requestId: `r-${op}`,
  sessionId: "s",
  vaultGeneration: a ? 1 : 0,
  vaultId: a ? "v" : null,
  windowId: "w",
});
async function activate(o: DesktopPickerOwner) {
  const i = id("activate", false),
    p = await o.pick(
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
  await o.bindVaultSelection(
    {
      claim: c.claim,
      operationId: i.operationId,
      vaultGeneration: 1,
      vaultId: "v",
    },
    new AbortController().signal,
  );
}
test("post-stability close cannot strand plaintext staging", async () => {
  const root = await temp("c14-close-"),
    vault = await temp("c14-vault-"),
    output = join(root, "output.html"),
    secret = Buffer.from("post-stability confidential bytes");
  const o = new DesktopPickerOwner({
    isAvailable: () => true,
    showOpenDialog: async () => ({ canceled: false, filePath: vault }),
    showSaveDialog: async () => ({ canceled: false, filePath: output }),
  });
  await activate(o);
  const i = id("export"),
    p = await o.pick(
      { identity: i, kind: "destination", purpose: "export-html" },
      new AbortController().signal,
    );
  assert.equal(p.status, "selected");
  if (p.status !== "selected") throw 0;
  const plan = {
      entries: [
        {
          digest: createHash("sha256").update(secret).digest("hex") as never,
          size: secret.length,
          target: { kind: "selected-file" as const },
        },
      ] as const,
      purpose: "export-html" as const,
      totalBytes: secret.length,
    },
    planDigest = computeDesktopDestinationPlanDigest(plan),
    locked = await o.lockDestinationPlan(
      {
        ...plan,
        identity: i,
        planDigest,
        selectionAuthorization: p.authorization,
      },
      new AbortController().signal,
    ),
    begun = await o.beginDestination(
      { ...plan, authorization: locked.authorization, identity: i, planDigest },
      new AbortController().signal,
    );
  await o.writeDestinationChunk(
    {
      bytes: secret,
      offset: 0,
      planDigest,
      session: begun.session,
      target: { kind: "selected-file" },
    },
    new AbortController().signal,
  );
  const stageName = (await readdir(root)).find((n) =>
    n.startsWith(".tockteam-picker-stage-"),
  );
  assert.ok(stageName);
  const stage = join(root, stageName),
    moved = `${stage}-moved`;
  const entry = (o as any).destinations.get(begun.session).entries[0],
    original = entry.handle.close.bind(entry.handle);
  entry.handle.close = async () => {
    await original();
    await rename(stage, moved);
    await mkdir(stage);
    await writeFile(join(stage, "attacker-sentinel"), "keep");
  };
  const result = await o.finalizeDestination(
    { expectedState: begun.expectedState, planDigest, session: begun.session },
    new AbortController().signal,
  );
  assert.equal(result.status, "published");
  if (result.status === "published") assert.equal(result.cleanup.status, "residual");
  assert.deepEqual(await readFile(output), secret);
  const names = await readdir(root);
  assert.equal(
    names.some((n) => n.startsWith(".tockteam-picker-commit-")),
    false,
  );
  assert.equal(
    names.some((n) => n.endsWith("-moved")),
    true,
  );
  await o.dispose();
});
