export const RIVE_CONTRACT = {
  artboard: "Main",
  stateMachine: "Presentation",
  properties: {
    lookX: [-1, 1],
    lookY: [-1, 1],
    smile: [0, 1],
    eyebrow: [-1, 1],
    pose: [0, 5],
  },
  triggers: ["blink", "celebrate"],
  states: ["idle", "pose", "match", "cheer"],
} as const;

export function validateRiveViewModel(viewModel: any): string[] {
  const missing: string[] = [];
  for (const key of Object.keys(RIVE_CONTRACT.properties)) {
    if (!viewModel?.number?.(key)) missing.push(`number:${key}`);
  }
  for (const key of RIVE_CONTRACT.triggers) {
    if (!viewModel?.trigger?.(key)) missing.push(`trigger:${key}`);
  }
  return missing;
}
