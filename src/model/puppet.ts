import { Rng } from "./rng.ts";

export interface RigValues {
  lookX: number;
  lookY: number;
  smile: number;
  eyebrow: number;
  pose: number;
}

export interface Challenge {
  id: number;
  target: RigValues;
  tolerance: number;
}

const TARGETS: RigValues[] = [
  { lookX: 0.8, lookY: 0.2, smile: 0.9, eyebrow: 0.3, pose: 1 },
  { lookX: -0.6, lookY: -0.4, smile: 0.2, eyebrow: -0.7, pose: 2 },
  { lookX: 0.1, lookY: 0.9, smile: 0.6, eyebrow: 0.8, pose: 3 },
  { lookX: -0.9, lookY: 0.5, smile: 0.1, eyebrow: 0.4, pose: 0 },
  { lookX: 0.4, lookY: -0.8, smile: 0.8, eyebrow: -0.2, pose: 4 },
  { lookX: 0, lookY: 0, smile: 0.5, eyebrow: 0, pose: 5 },
  { lookX: 0.7, lookY: -0.3, smile: 0.3, eyebrow: 0.9, pose: 2 },
  { lookX: -0.3, lookY: 0.6, smile: 0.95, eyebrow: -0.9, pose: 1 },
];

export const CHALLENGES: readonly Challenge[] = TARGETS.map((target, index) => ({
  id: index,
  target,
  tolerance: 0.15,
}));

export interface PuppetSnapshot {
  values: RigValues;
  challengeId: number;
  score: number;
  slots: (RigValues | null)[];
  rngState: number;
}

export class PuppetSession {
  readonly rng: Rng;
  values: RigValues = { lookX: 0, lookY: 0, smile: 0, eyebrow: 0, pose: 0 };
  challengeId = 0;
  score = 0;
  slots: (RigValues | null)[] = Array.from({ length: 6 }, () => null);

  constructor(seed: string | number = "expression-puppet", snapshot?: PuppetSnapshot) {
    this.rng = new Rng(seed);
    if (snapshot !== undefined) this.applySnapshot(snapshot);
  }

  get challenge(): Challenge {
    return CHALLENGES[this.challengeId];
  }

  /** The single canonical write path; every control clamps to authored ranges. */
  setParam(name: keyof RigValues, value: number): void {
    if (name === "pose") {
      this.values.pose = Math.min(5, Math.max(0, Math.round(value)));
      return;
    }
    if (name === "smile") {
      this.values.smile = Math.min(1, Math.max(0, value));
      return;
    }
    this.values[name] = Math.min(1, Math.max(-1, value));
  }

  /** Score is computed from canonical app values only; never from Rive events. */
  match(): number {
    const weights = { lookX: 25, lookY: 25, smile: 25, eyebrow: 15, pose: 10 } as const;
    let distance = 0;
    for (const key of Object.keys(weights) as (keyof RigValues)[]) {
      distance += Math.abs(this.values[key] - this.challenge.target[key]) * weights[key];
    }
    this.score = Math.max(0, Math.round(100 - distance));
    return this.score;
  }

  saveSlot(index: number): boolean {
    if (index < 0 || index >= this.slots.length) return false;
    this.slots[index] = { ...this.values };
    return true;
  }

  loadSlot(index: number): boolean {
    const slot = this.slots[index];
    if (slot === null || slot === undefined) return false;
    this.values = { ...slot };
    return true;
  }

  snapshot(): PuppetSnapshot {
    return {
      values: { ...this.values },
      challengeId: this.challengeId,
      score: this.score,
      slots: this.slots.map((slot) => (slot === null ? null : { ...slot })),
      rngState: this.rng.getState(),
    };
  }

  applySnapshot(snapshot: PuppetSnapshot): void {
    validateSnapshot(snapshot);
    this.values = { ...snapshot.values };
    this.challengeId = snapshot.challengeId;
    this.score = snapshot.score;
    this.slots = snapshot.slots.map((slot) => (slot === null ? null : { ...slot }));
    this.rng.setState(snapshot.rngState);
  }
}

export const SAVE_FORMAT = "ksu.game.save";
export const SAVE_APP_ID = "expression-puppet";

export class SaveError extends Error {
  constructor(reason: string) {
    super(`expression-puppet save rejected: ${reason}`);
    this.name = "SaveError";
  }
}

const RIG_RANGES: Record<keyof RigValues, readonly [number, number]> = {
  lookX: [-1, 1],
  lookY: [-1, 1],
  smile: [0, 1],
  eyebrow: [-1, 1],
  pose: [0, 5],
};

function validateValues(values: unknown, label: string): asserts values is RigValues {
  if (values === null || typeof values !== 'object') throw new SaveError(`invalid ${label}`);
  for (const key of Object.keys(RIG_RANGES) as (keyof RigValues)[]) {
    const value = (values as Partial<RigValues>)[key];
    if (!Number.isFinite(value) || value! < RIG_RANGES[key][0] || value! > RIG_RANGES[key][1]) {
      throw new SaveError(`invalid ${label}.${key}`);
    }
  }
  if (!Number.isInteger((values as RigValues).pose)) throw new SaveError(`invalid ${label}.pose`);
}

function validateSnapshot(snapshot: PuppetSnapshot): void {
  if (snapshot === null || typeof snapshot !== 'object') throw new SaveError('invalid snapshot');
  validateValues(snapshot.values, 'values');
  if (!Number.isInteger(snapshot.challengeId) || snapshot.challengeId < 0 || snapshot.challengeId >= CHALLENGES.length) {
    throw new SaveError('invalid challenge');
  }
  if (!Number.isInteger(snapshot.score) || snapshot.score < 0 || snapshot.score > 100) throw new SaveError('invalid score');
  if (!Array.isArray(snapshot.slots) || snapshot.slots.length !== 6) throw new SaveError('slot count mismatch');
  for (const [index, slot] of snapshot.slots.entries()) {
    if (slot !== null) validateValues(slot, `slot ${index + 1}`);
  }
  if (!Number.isInteger(snapshot.rngState) || snapshot.rngState < 0 || snapshot.rngState > 0xffffffff) {
    throw new SaveError('invalid rng state');
  }
}

export function encodeSave(session: PuppetSession): string {
  return JSON.stringify({
    format: SAVE_FORMAT,
    schemaVersion: 1,
    appId: SAVE_APP_ID,
    kind: "logical-snapshot",
    gameBuild: "unbound",
    contentVersion: "1",
    payload: session.snapshot(),
  });
}

export function decodeSave(text: string, maxBytes = 8 * 1024 * 1024): { payload: PuppetSnapshot } {
  if (text.length > maxBytes) throw new SaveError("document exceeds the size limit");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new SaveError("document is not valid JSON");
  }
  const envelope = parsed as Record<string, unknown>;
  if (envelope.format !== SAVE_FORMAT || envelope.schemaVersion !== 1 || envelope.appId !== SAVE_APP_ID ||
      envelope.kind !== "logical-snapshot" || envelope.contentVersion !== "1" || typeof envelope.payload !== "object") {
    throw new SaveError("wrong envelope");
  }
  const payload = envelope.payload as PuppetSnapshot;
  validateSnapshot(payload);
  return { payload };
}

export function sessionFromSave(envelope: { payload: PuppetSnapshot }): PuppetSession {
  return new PuppetSession("restore", envelope.payload);
}
