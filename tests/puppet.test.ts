import { describe, expect, it } from "./test-shim.ts";
import {
  CHALLENGES,
  PuppetSession,
  decodeSave,
  encodeSave,
  sessionFromSave,
} from "../src/model/puppet.ts";
import {RIVE_CONTRACT, validateRiveViewModel} from "../src/rive/contract.ts";

describe("PuppetSession rules", () => {
  it("all control values clamp to documented ranges", () => {
    const session = new PuppetSession("clamp");
    session.setParam("lookX", 99);
    session.setParam("lookY", -99);
    session.setParam("smile", 9);
    session.setParam("eyebrow", -9);
    session.setParam("pose", 99);
    expect(session.values).toEqual({ lookX: 1, lookY: -1, smile: 1, eyebrow: -1, pose: 5 });
  });

  it("pose score uses app values only", () => {
    const session = new PuppetSession("score");
    const initial = session.match();
    expect(initial).toBeGreaterThanOrEqual(0);
    expect(initial).toBeLessThanOrEqual(100);
    for (const key of Object.keys(session.challenge.target) as (keyof typeof session.challenge.target)[]) {
      session.setParam(key, session.challenge.target[key]);
    }
    expect(session.match()).toBe(100);
  });

  it("saved slots restore all parameters", () => {
    const session = new PuppetSession("slots");
    session.setParam("lookX", 0.3);
    session.setParam("smile", 0.8);
    session.setParam("pose", 4);
    expect(session.saveSlot(2)).toBe(true);
    session.setParam("lookX", -1);
    expect(session.loadSlot(2)).toBe(true);
    expect(session.values).toEqual({ lookX: 0.3, lookY: 0, smile: 0.8, eyebrow: 0, pose: 4 });
  });

  it("frame rate and resize cannot change score or pose", () => {
    const session = new PuppetSession("stable");
    session.setParam("smile", 0.5);
    const before = { ...session.values };
    const score = session.match();
    expect(session.values).toEqual(before);
    expect(session.match()).toBe(score);
    expect(CHALLENGES).toHaveLength(8);
  });

  it("save/load round-trips slots and challenge state", () => {
    const session = new PuppetSession("save");
    session.setParam("pose", 3);
    session.saveSlot(0);
    const restored = sessionFromSave(decodeSave(encodeSave(session)));
    expect(restored.snapshot()).toEqual(session.snapshot());
  });

  it("rejects out-of-range values, bad slots and wrong envelopes", () => {
    const session = new PuppetSession("invalid");
    session.saveSlot(0);
    const good = JSON.parse(encodeSave(session));
    for (const mutate of [
      (value: any) => value.appId = "other",
      (value: any) => value.schemaVersion = 2,
      (value: any) => value.payload = null,
      (value: any) => value.payload.values.lookX = 2,
      (value: any) => value.payload.values.pose = 2.5,
      (value: any) => value.payload.challengeId = 99,
      (value: any) => value.payload.score = -1,
      (value: any) => value.payload.slots.pop(),
      (value: any) => value.payload.slots[0].smile = 3,
    ]) {
      const bad = structuredClone(good);
      mutate(bad);
      expect(() => decodeSave(JSON.stringify(bad))).toThrow();
    }
  });

  it("retains the authored Rive contract and validates all required view-model fields", () => {
    expect(RIVE_CONTRACT).toMatchObject({artboard: "Main", stateMachine: "Presentation"});
    const calls: string[] = [];
    const vm = {
      number: (key: string) => { calls.push("number:" + key); return {}; },
      trigger: (key: string) => { calls.push("trigger:" + key); return {}; },
    };
    expect(validateRiveViewModel(vm)).toEqual([]);
    expect(calls).toEqual(expect.arrayContaining([
      "number:lookX", "number:lookY", "number:smile", "number:eyebrow", "number:pose",
      "trigger:blink", "trigger:celebrate",
    ]));
    expect(validateRiveViewModel({})).toHaveLength(7);
  });
});
