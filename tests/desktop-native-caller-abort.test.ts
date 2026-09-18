import assert from "node:assert/strict";
import { test } from "node:test";
import { DesktopMicrophoneChannel } from "../src/desktop-microphone-channel.ts";
import { DesktopMicrophoneOwner } from "../src/desktop-microphone-owner.ts";
import { DesktopMicrophoneProvider } from "../src/desktop-microphone-provider.ts";
import { DesktopPickerOwner } from "../src/desktop-picker-owner.ts";
import { DesktopPopOutChannel } from "../src/desktop-popout-channel.ts";
import { DesktopPopOutOwner } from "../src/desktop-popout-owner.ts";
import { DesktopPopOutProvider } from "../src/desktop-popout-provider.ts";
import { DesktopPrintExportChannel } from "../src/desktop-print-export-channel.ts";
import { DesktopPrintExportOwner } from "../src/desktop-print-export-owner.ts";
import { DesktopPrintExportProvider } from "../src/desktop-print-export-provider.ts";
import type { NativeOperationIdentity } from "../src/host-contract.ts";

const identity: NativeOperationIdentity = {
  operationId: "op",
  requestId: "r",
  sessionId: "s",
  vaultId: "v",
  vaultGeneration: 1,
  windowId: "main",
};
const current = () => ({ active: true as const, generation: 1, id: "v" });
function gate() {
  let start!: () => void;
  const started = new Promise<void>((r) => {
    start = r;
  });
  let release!: () => void;
  const blocked = new Promise<void>((r) => {
    release = r;
  });
  return { start, started, release, blocked };
}

test("arbitrary caller abort closes a response-gated pop-out", async () => {
  const g = gate();
  const windows = new Set<string>();
  const owner = new DesktopPopOutOwner({
    isAvailable: () => true,
    isCurrent: () => true,
    native: {
      close: (id) => {
        windows.delete(id);
      },
      focus: () => true,
      isOpen: (id) => windows.has(id),
      open: async () => {
        g.start();
        await g.blocked;
        windows.add("pop");
        return "pop";
      },
    },
  });
  const channel = new DesktopPopOutChannel(owner);
  const provider = new DesktopPopOutProvider(
    await channel.start(),
    fetch,
    current,
  );
  const controller = new AbortController();
  const opening = provider.open(
    { identity, relativePath: "note.md" as never },
    controller.signal,
  );
  await g.started;
  controller.abort();
  g.release();
  assert.equal((await opening).status, "cancelled");
  assert.deepEqual([...windows], []);
  await provider.dispose();
  await channel.stop();
});

test("arbitrary caller abort revokes a response-gated microphone grant", async () => {
  const g = gate();
  const owner = new DesktopMicrophoneOwner({
    isAvailable: () => true,
    isCurrent: () => true,
    requestAccess: async () => {
      g.start();
      await g.blocked;
      return true;
    },
  });
  const channel = new DesktopMicrophoneChannel(owner);
  const provider = new DesktopMicrophoneProvider(
    await channel.start(),
    fetch,
    current,
  );
  const controller = new AbortController();
  const asking = provider.request({ identity }, controller.signal);
  await g.started;
  controller.abort();
  g.release();
  assert.equal((await asking).status, "cancelled");
  assert.equal(owner.consumePermission(), false);
  await provider.dispose();
  await channel.stop();
});

test("admitted print returns its committed result despite caller abort", async () => {
  const g = gate();
  let effects = 0;
  const picker = new DesktopPickerOwner({
    isAvailable: () => true,
    showOpenDialog: async () => ({ canceled: true }),
    showSaveDialog: async () => ({ canceled: true }),
  });
  const owner = new DesktopPrintExportOwner({
    isAvailable: () => true,
    isCurrent: () => true,
    picker,
    native: {
      print: async () => {
        g.start();
        await g.blocked;
        effects++;
        return true;
      },
      renderPdf: async () => new Uint8Array(),
    },
  });
  const channel = new DesktopPrintExportChannel(owner);
  const provider = new DesktopPrintExportProvider(
    await channel.start(),
    fetch,
    current,
  );
  const controller = new AbortController();
  const printing = provider.render(
    { format: "print", html: "<p>x</p>", identity, title: "Print" },
    controller.signal,
  );
  await g.started;
  controller.abort();
  g.release();
  assert.equal((await printing).status, "printed");
  assert.equal(effects, 1);
  await provider.dispose();
  await channel.stop();
  await picker.dispose();
});

test("caller abort closes a response-gated pop-out after a vault transition", async () => {
  let generation = 1;
  const windows = new Set<string>();
  const owner = new DesktopPopOutOwner({
    isAvailable: () => true,
    isCurrent: (request) =>
      request.vaultId === "v" && request.vaultGeneration === generation,
    native: {
      close: (windowId) => {
        windows.delete(windowId);
      },
      focus: () => true,
      isOpen: (windowId) => windows.has(windowId),
      open: async () => {
        windows.add("pop");
        return "pop";
      },
    },
  });
  const channel = new DesktopPopOutChannel(owner);
  const environment = await channel.start();
  let announce!: () => void;
  const responseReady = new Promise<void>((resolve) => {
    announce = resolve;
  });
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  const provider = new DesktopPopOutProvider(
    environment,
    async (input, init) => {
      const response = await fetch(input, init);
      if (++calls === 1) {
        announce();
        await blocked;
      }
      return response;
    },
    () => ({ active: true, generation, id: "v" }),
  );
  const controller = new AbortController();
  const opening = provider.open(
    { identity, relativePath: "note.md" as never },
    controller.signal,
  );
  await responseReady;
  generation = 2;
  controller.abort();
  release();
  assert.equal((await opening).status, "cancelled");
  assert.deepEqual([...windows], []);
  await provider.dispose();
  await channel.stop();
});
