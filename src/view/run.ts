import {SynthAudio} from '../audio/synth.js';
import {
  CHALLENGES,
  PuppetSession,
  decodeSave,
  encodeSave,
  sessionFromSave,
  type RigValues,
} from '../model/puppet.js';

interface FileContext {
  owner: string;
  valid(): boolean;
  path(value: string): string;
  name(value: string): string;
  files: {
    read(path: string): Promise<{data: Uint8Array; version: string; status?: string}>;
    write(path: string, data: Uint8Array, version: string | null): Promise<{version: string; status?: string}>;
    stat?(path: string): Promise<{version: string; status?: string}>;
    subscribe?(callback: () => void): () => void;
  };
}

interface Host {
  signal: AbortSignal;
  w?: {
    title?: string;
    ownerSub?: string;
    launchContext?: {version: 1; storage: 'mirror'; path: string; owner: string};
    expressionPuppet?: {dirty: boolean};
  };
  ui: {
    make(tag: string, className?: string, text?: string): HTMLElement;
    textButton(label: string, action: () => void): HTMLButtonElement;
    appInput(label: string, value?: string): HTMLInputElement;
    confirm(message: string, options: {title?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean; signal?: AbortSignal}): Promise<boolean>;
  };
  storage: {
    signedInSubject(): string;
    mirrorFileContext(): Promise<FileContext>;
    pickFile(options: {extensions: string[]; signal?: AbortSignal}): Promise<string | null>;
    pickFolder(options: {signal?: AbortSignal}): Promise<string | null>;
  };
}

const PARAMETERS: Array<{key: keyof RigValues; label: string; min: number; max: number; step: number}> = [
  {key: 'lookX', label: 'Look X', min: -1, max: 1, step: .1},
  {key: 'lookY', label: 'Look Y', min: -1, max: 1, step: .1},
  {key: 'smile', label: 'Smile', min: 0, max: 1, step: .1},
  {key: 'eyebrow', label: 'Eyebrow', min: -1, max: 1, step: .1},
  {key: 'pose', label: 'Pose', min: 0, max: 5, step: 1},
];

export async function startView(host: Host, signal: AbortSignal): Promise<{element: HTMLElement; dispose(): void}> {
  const doc = document;
  const {make, textButton, appInput} = host.ui;
  const owner = host.w?.launchContext?.owner || host.storage.signedInSubject();
  const windowState = host.w?.expressionPuppet ?? {dirty: false};
  if (host.w) {
    host.w.expressionPuppet = windowState;
    host.w.ownerSub = owner;
  }

  let session = new PuppetSession(`puppet-${crypto.randomUUID()}`);
  let disposed = false;
  let paused = true;
  let busy = false;
  let dirty = false;
  let revision = 0;
  let savedPath: string | null = null;
  let savedVersion: string | null = null;
  let unwatch = () => {};
  let watchSerial = 0;
  let frame = 0;
  let lastPaint = '';
  let reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let dragPointer: number | null = null;
  const audio = new SynthAudio();
  audio.setMuted(true);

  const element = make('section', 'puppet-view');
  const shell = make('div', 'puppet-shell');
  const header = make('header', 'puppet-header');
  const heading = make('div');
  heading.append(
    make('h2', 'puppet-heading', 'Expression Puppet'),
    make('p', 'puppet-subtitle', 'Direct a face through expression challenges or free play.'),
  );
  const toolbar = make('div', 'puppet-toolbar');
  const pause = textButton('Resume', () => togglePause());
  const match = textButton('Match pose', () => scorePose());
  const restart = textButton('Restart', () => void restartPose());
  const openButton = textButton('Open from My files', () => void open());
  const saveButton = textButton('Save to My files', () => void save());
  toolbar.append(pause, match, restart, openButton, saveButton);
  header.append(heading, toolbar);

  const stage = make('div', 'puppet-stage');
  const canvas = make('canvas', 'puppet-face') as HTMLCanvasElement;
  canvas.width = 560;
  canvas.height = 420;
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-label', 'Puppet face. Drag to move the eyes; use the sliders for pose controls.');
  stage.append(canvas);

  const side = make('div', 'puppet-side');
  const riveNote = make('p', 'puppet-rive-pending', 'Development face preview — final expression-puppet.riv artwork is pending.');
  const challengeLabel = make('label', '', 'Challenge ');
  const challengeSelect = doc.createElement('select');
  challengeSelect.setAttribute('aria-label', 'Expression challenge');
  CHALLENGES.forEach((item, index) => challengeSelect.append(new Option(`Challenge ${index + 1}`, String(index))));
  challengeLabel.append(challengeSelect);
  const target = make('div', 'puppet-target'), targetText = make('div', 'puppet-target-text');
  const targetCanvas = make('canvas', 'puppet-target-face') as HTMLCanvasElement;
  targetCanvas.width = 240;
  targetCanvas.height = 160;
  target.append(make('strong', '', 'Target expression'), targetCanvas, targetText);
  const score = make('div', 'puppet-score');

  const controls = make('div', 'puppet-controls');
  const ranges = new Map<keyof RigValues, HTMLInputElement>();
  const outputs = new Map<keyof RigValues, HTMLOutputElement>();
  for (const parameter of PARAMETERS) {
    const label = make('label', 'puppet-control', parameter.label);
    const range = doc.createElement('input');
    range.type = 'range';
    range.min = String(parameter.min);
    range.max = String(parameter.max);
    range.step = String(parameter.step);
    range.value = String(session.values[parameter.key]);
    range.setAttribute('aria-label', parameter.label);
    const output = doc.createElement('output');
    output.textContent = range.value;
    range.addEventListener('input', () => {
      session.setParam(parameter.key, Number(range.value));
      output.textContent = String(session.values[parameter.key]);
      mark();
      draw();
    });
    ranges.set(parameter.key, range);
    outputs.set(parameter.key, output);
    label.append(range, output);
    controls.append(label);
  }

  const slots = make('div', 'puppet-slots');
  for (let index = 0; index < 6; index++) {
    const slot = make('span', 'puppet-slot');
    slot.append(
      textButton(`Save pose ${index + 1}`, () => {
        session.saveSlot(index);
        mark();
        announce(`Pose saved in slot ${index + 1}.`);
        refreshSlots();
      }),
      textButton(`Load pose ${index + 1}`, () => {
        if (!session.loadSlot(index)) {
          announce(`Pose slot ${index + 1} is empty.`);
          return;
        }
        mark();
        syncControls();
        draw();
        announce(`Pose slot ${index + 1} loaded.`);
      }),
    );
    slot.dataset.slot = String(index);
    slots.append(slot);
  }

  const settings = doc.createElement('details');
  settings.className = 'puppet-settings';
  const soundLabel = make('label', '', 'Sound ');
  const sound = doc.createElement('input');
  sound.type = 'checkbox';
  sound.setAttribute('aria-label', 'Sound effects');
  soundLabel.prepend(sound);
  const volumeLabel = make('label', '', 'Volume ');
  const volume = doc.createElement('input');
  volume.type = 'range';
  volume.min = '0';
  volume.max = '100';
  volume.value = '30';
  volume.disabled = true;
  volume.setAttribute('aria-label', 'Sound volume');
  volumeLabel.append(volume);
  const motionLabel = make('label', '', 'Reduce motion ');
  const motion = doc.createElement('input');
  motion.type = 'checkbox';
  motion.checked = reducedMotion;
  motion.setAttribute('aria-label', 'Reduce motion');
  motionLabel.prepend(motion);
  settings.append(make('summary', '', 'Settings'), soundLabel, volumeLabel, motionLabel);

  const help = doc.createElement('details');
  help.className = 'puppet-help';
  help.append(
    make('summary', '', 'How to play'),
    make('p', '', 'Drag the face or use the sliders to control gaze, smile, eyebrows and pose. Match score compares these values with the target expression. Save up to six reusable pose slots, then save the complete project to My files.'),
  );

  const saveDetails = doc.createElement('details');
  saveDetails.className = 'puppet-save';
  const saveFields = make('div', 'puppet-save-fields');
  const path = appInput('Puppet save path', host.w?.launchContext?.path || '/Expression Puppet.game.json');
  const folder = textButton('Choose folder', () => void chooseFolder());
  saveFields.append(path, folder);
  saveDetails.append(make('summary', '', 'Save location'), saveFields);

  const warning = make('p', 'puppet-warning');
  warning.hidden = true;
  warning.setAttribute('role', 'status');
  const status = make('div', 'puppet-status app-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  side.append(riveNote, challengeLabel, target, score, controls, slots, settings, help, saveDetails, warning);
  shell.append(header, stage, side, status);
  element.append(shell);

  const valid = () => !disposed && !signal.aborted && element.isConnected && owner === host.storage.signedInSubject();
  const announce = (text: string) => {
    if (valid()) status.textContent = text;
  };
  const setDirty = (value: boolean) => {
    dirty = value;
    windowState.dirty = value;
  };
  const mark = () => {
    dirty = true;
    windowState.dirty = true;
    revision++;
  };
  const pendingSave = () => {
    const wasDirty = dirty, atRevision = revision;
    let committed = false;
    setDirty(true);
    return {
      committed() { committed = true; },
      finish() { if (!committed && valid() && revision === atRevision) setDirty(wasDirty); },
    };
  };

  function syncControls() {
    for (const parameter of PARAMETERS) {
      const range = ranges.get(parameter.key)!;
      range.value = String(session.values[parameter.key]);
      outputs.get(parameter.key)!.textContent = range.value;
    }
  }

  function refreshSlots() {
    for (let index = 0; index < 6; index++) {
      const node = slots.querySelector<HTMLElement>(`[data-slot="${index}"]`)!;
      node.dataset.saved = String(session.slots[index] !== null);
    }
  }

  function setPaused(value: boolean) {
    paused = value;
    pause.textContent = paused ? 'Resume' : 'Pause';
    pause.setAttribute('aria-label', pause.textContent);
    if (paused) {
      audio.setMuted(true);
    } else {
      audio.setMuted(!sound.checked);
      if (sound.checked) audio.unlock();
    }
  }

  function togglePause() {
    setPaused(!paused);
    announce(paused ? 'Pose paused. Your values are retained.' : 'Pose active.');
  }

  function scorePose() {
    const value = session.match();
    mark();
    score.textContent = `Last match score: ${value}/100. Press Match pose to update.`;
    if (value >= 85) {
      if (sound.checked) audio.tone(660, 120, 'triangle');
      announce('Excellent match. Choose another challenge or keep refining.');
    } else {
      if (sound.checked) audio.tone(220, 80);
      announce('Pose scored. Compare the target and adjust the controls.');
    }
    draw();
  }

  async function restartPose() {
    if (busy || !valid()) return;
    busy = true;
    const before = revision, snapshot = encodeSave(session);
    try {
      if (dirty && !await host.ui.confirm('Reset this pose and discard unsaved changes?', {
      title: 'Reset puppet pose', confirmLabel: 'Reset pose', cancelLabel: 'Keep current', danger: true, signal,
      })) return;
      if (!valid()) return;
      if (revision !== before || encodeSave(session) !== snapshot) throw Error('The puppet changed while confirming; try again.');
      session = new PuppetSession(`puppet-${crypto.randomUUID()}`);
      session.challengeId = Number(challengeSelect.value);
      clearWatch();
      savedPath = null;
      savedVersion = null;
      revision++;
      setDirty(false);
      if (host.w) delete host.w.launchContext;
      path.value = '/Expression Puppet.game.json';
      syncControls();
      refreshSlots();
      draw();
      announce('Pose reset. Press Resume to continue.');
    } catch (error) {
      announce('Could not reset puppet: ' + (error instanceof Error ? error.message : 'unknown error'));
    } finally {
      busy = false;
    }
  }

  async function chooseFolder() {
    try {
      const selected = await host.storage.pickFolder({signal});
      if (selected === null || !valid()) return;
      const context = await host.storage.mirrorFileContext();
      if (!valid() || !context.valid()) return;
      path.value = context.path((selected === '/' ? '' : selected) + '/' +
        context.name(path.value.split('/').pop() || 'Expression Puppet.game.json'));
    } catch (error) {
      announce('Could not choose folder: ' + (error instanceof Error ? error.message : 'unknown error'));
    }
  }

  function clearWatch() {
    watchSerial++;
    unwatch();
    unwatch = () => {};
  }

  function watch(context: FileContext, filePath: string, version: string) {
    clearWatch();
    const serial = watchSerial;
    const check = async () => {
      if (!valid() || !context.valid() || savedPath !== filePath || savedVersion !== version) return;
      let message = '';
      try {
        const current = context.files.stat ? await context.files.stat(filePath) : await context.files.read(filePath);
        message = current.status === 'conflict'
          ? 'This puppet project has conflicting copies. Resolve them in Files.'
          : current.version !== version ? 'The saved puppet project changed. Your current pose is unchanged.' : '';
      } catch {
        message = 'The saved puppet project is unavailable. Your current pose is unchanged.';
      }
      if (serial === watchSerial && valid()) {
        warning.textContent = message;
        warning.hidden = !message;
      }
    };
    unwatch = context.files.subscribe?.(check) || (() => {});
    queueMicrotask(check);
  }

  async function save() {
    if (busy || !valid()) return;
    busy = true;
    const guard = pendingSave();
    setPaused(true);
    const capturedRevision = revision;
    const text = encodeSave(session);
    const requested = path.value;
    try {
      const context = await host.storage.mirrorFileContext();
      const filePath = context.path(requested);
      if (!filePath.toLowerCase().endsWith('.game.json')) throw Error('Use a .game.json file name.');
      let expected: string | null = null;
      try {
        const existing = context.files.stat ? await context.files.stat(filePath) : await context.files.read(filePath);
        if (existing.status === 'conflict') throw Error('Resolve the conflict in Files first.');
        if (filePath === savedPath && savedVersion) {
          if (existing.version !== savedVersion) throw Error('The saved puppet project changed. Save a copy or reopen it.');
        } else if (!await host.ui.confirm(`Replace ${filePath}?`, {
          title: 'Replace puppet project', confirmLabel: 'Replace', cancelLabel: 'Cancel', danger: true, signal,
        })) {
          announce('Save cancelled.');
          return;
        }
        expected = existing.version;
      } catch (error) {
        if (!(error instanceof Error) || error.message !== 'File not found.') throw error;
        if (filePath === savedPath && savedVersion) throw Error('The saved puppet project was removed. Save a copy or reopen it.');
      }
      if (!valid() || !context.valid()) return;
      const result = await context.files.write(filePath, new TextEncoder().encode(text), expected);
      if (!valid() || !context.valid()) return;
      savedPath = filePath;
      savedVersion = result.version;
      if (path.value === requested) path.value = filePath;
      const newer = revision !== capturedRevision || encodeSave(session) !== text;
      setDirty(newer);
      guard.committed();
      if (host.w) {
        host.w.launchContext = Object.freeze({version: 1, storage: 'mirror', path: filePath, owner});
        host.w.title = `${filePath.split('/').pop()} — Expression Puppet`;
      }
      watch(context, filePath, result.version);
      announce(result.status === 'conflict'
        ? 'Saved on this device with conflicting copies. Resolve them in Files.'
        : newer
          ? 'Puppet project saved to My files; newer edits remain unsaved.'
          : 'Puppet project saved to My files; syncing with the server.');
    } catch (error) {
      announce('Could not save puppet project: ' + (error instanceof Error ? error.message : 'unknown error'));
    } finally {
      guard.finish();
      busy = false;
    }
  }

  async function open(selected?: string) {
    if (busy || !valid()) return;
    busy = true;
    setPaused(true);
    const before = revision, snapshot = encodeSave(session);
    try {
      if (dirty && !await host.ui.confirm('Open a saved puppet and discard current pose changes?', {
        title: 'Unsaved puppet pose', confirmLabel: 'Discard pose', cancelLabel: 'Keep current', danger: true, signal,
      })) {
        announce('Puppet remains paused.');
        return;
      }
      if (!valid()) return;
      if (revision !== before || encodeSave(session) !== snapshot) throw Error('The puppet changed while confirming; try again.');
      const choice = selected || await host.storage.pickFile({extensions: ['.json'], signal});
      if (!choice || !valid()) return;
      const context = await host.storage.mirrorFileContext();
      const filePath = context.path(choice);
      const file = await context.files.read(filePath);
      if (!valid() || !context.valid()) return;
      if (file.status === 'conflict') throw Error('Resolve the conflict in Files first.');
      if (file.data.byteLength > 8 * 1024 * 1024) throw Error('Puppet project is too large.');
      const restored = sessionFromSave(decodeSave(new TextDecoder('utf-8', {fatal: true}).decode(file.data)));
      if (!valid() || !context.valid()) return;
      if (revision !== before || encodeSave(session) !== snapshot) throw Error('The puppet changed while opening; try again.');
      session = restored;
      setPaused(true);
      savedPath = filePath;
      savedVersion = file.version;
      path.value = filePath;
      challengeSelect.value = String(session.challengeId);
      setDirty(false);
      warning.hidden = true;
      if (host.w) {
        host.w.launchContext = Object.freeze({version: 1, storage: 'mirror', path: filePath, owner});
        host.w.title = `${filePath.split('/').pop()} — Expression Puppet`;
      }
      syncControls();
      refreshSlots();
      draw();
      watch(context, filePath, file.version);
      announce('Puppet project loaded and paused. Press Resume to continue.');
    } catch (error) {
      announce('Could not open puppet project: ' + (error instanceof Error ? error.message : 'unknown error'));
    } finally {
      busy = false;
    }
  }

  function parameterPoint(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    session.setParam('lookX', ((event.clientX - rect.left) / rect.width) * 2 - 1);
    session.setParam('lookY', ((event.clientY - rect.top) / rect.height) * 2 - 1);
    mark();
    syncControls();
    draw();
  }

  const pointerDown = (event: PointerEvent) => {
    dragPointer = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    parameterPoint(event);
  };
  const pointerMove = (event: PointerEvent) => {
    if (event.pointerId === dragPointer) parameterPoint(event);
  };
  const pointerRelease = () => {
    dragPointer = null;
  };
  const suspend = () => {
    if (!paused) togglePause();
  };
  const visibility = () => {
    if (doc.hidden) suspend();
  };
  let observedWindow: HTMLElement | null = null;
  const windowObserver = new MutationObserver(() => watchWindow());
  const watchWindow = () => {
    const target = element.closest<HTMLElement>('.window');
    if (target !== observedWindow) {
      windowObserver.disconnect();
      observedWindow = target;
      if (target) windowObserver.observe(target, {attributes: true, attributeFilter: ['class', 'hidden']});
    }
    if (target && (target.hidden || !target.classList.contains('focused') || target.classList.contains('rolled'))) suspend();
  };

  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerup', pointerRelease);
  canvas.addEventListener('pointercancel', pointerRelease);
  window.addEventListener('blur', suspend);
  doc.addEventListener('visibilitychange', visibility);
  challengeSelect.addEventListener('change', () => {
    session.challengeId = Number(challengeSelect.value);
    mark();
    draw();
    announce(`Challenge ${session.challengeId + 1} selected. Match its expression.`);
  });
  sound.addEventListener('change', () => {
    volume.disabled = !sound.checked;
    audio.setMuted(!sound.checked);
    if (sound.checked) audio.unlock();
  });
  volume.addEventListener('input', () => audio.setVolume(Number(volume.value) / 100));
  motion.addEventListener('change', () => {
    reducedMotion = motion.checked;
    draw();
  });

  function drawFace(context: CanvasRenderingContext2D, values: RigValues, width: number, height: number, blink = false) {
    const cx = width / 2, cy = height / 2 + 8;
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#3b3248';
    context.fillRect(0, 0, width, height);
    context.fillStyle = '#d8af94';
    context.beginPath();
    context.arc(cx, cy, Math.min(width, height) * .34, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#f3eee4';
    const eyeY = cy - height * .1 + values.lookY * height * .035;
    const eyeX = values.lookX * width * .025;
    for (const offset of [-width * .075, width * .075]) {
      context.beginPath();
      context.ellipse(cx + offset, eyeY, width * .04, height * (blink ? .012 : .055), 0, 0, Math.PI * 2);
      context.fill();
    }
    context.fillStyle = '#27212d';
    for (const offset of [-width * .075, width * .075]) {
      context.beginPath();
      context.arc(cx + offset + eyeX, eyeY + values.lookY * height * .018, width * .015, 0, Math.PI * 2);
      context.fill();
    }
    context.strokeStyle = '#503c3c';
    context.lineWidth = Math.max(2, width * .009);
    for (const offset of [-1, 1]) {
      const browY = eyeY - height * .09 - values.eyebrow * height * .025 * offset;
      context.beginPath();
      context.moveTo(cx + offset * width * .075 - width * .035, browY);
      context.lineTo(cx + offset * width * .075 + width * .035, browY + values.eyebrow * height * .012);
      context.stroke();
    }
    context.strokeStyle = '#7e353b';
    context.lineWidth = Math.max(3, width * .013);
    context.beginPath();
    const smileY = cy + height * .13;
    context.moveTo(cx - width * .09, smileY);
    context.quadraticCurveTo(cx, smileY + values.smile * height * .11, cx + width * .09, smileY);
    context.stroke();
    const poseOffset = values.pose * height * .012;
    context.strokeStyle = '#8c6fa9';
    context.lineWidth = maxLine(width);
    context.beginPath();
    context.moveTo(cx - width * .15, cy + height * .28 - poseOffset);
    context.lineTo(cx + width * .15, cy + height * .28 + poseOffset);
    context.stroke();
  }

  function maxLine(width: number) {
    return Math.max(3, width * .01);
  }

  function drawTarget() {
    const context = targetCanvas.getContext('2d');
    if (!context) return;
    drawFace(context, session.challenge.target, targetCanvas.width, targetCanvas.height);
  }

  function draw() {
    const context = canvas.getContext('2d');
    if (!context) return;
    const blink = !reducedMotion && Math.floor(performance.now() / 3200) % 5 === 4;
    const key = JSON.stringify([session.values, blink, session.challengeId, session.score]);
    if (key === lastPaint) return;
    lastPaint = key;
    drawFace(context, session.values, canvas.width, canvas.height, blink);
    targetText.textContent = `Target ${session.challengeId + 1}: Look ${session.challenge.target.lookX.toFixed(1)}, ${session.challenge.target.lookY.toFixed(1)} · Smile ${session.challenge.target.smile.toFixed(1)} · Brow ${session.challenge.target.eyebrow.toFixed(1)} · Pose ${session.challenge.target.pose}`;
    score.textContent = `Last match score: ${session.score}/100. Press Match pose to update.`;
    drawTarget();
  }

  const loop = (now: number) => {
    if (disposed) return;
    watchWindow();
    if (!paused) draw();
    frame = requestAnimationFrame(loop);
    void now;
  };

  syncControls();
  refreshSlots();
  draw();
  drawTarget();
  refreshSlots();
  pause.textContent = 'Resume';
  pause.setAttribute('aria-label', 'Resume');
  announce('Press Resume to activate the puppet. Use the sliders, drag the face, and match the target expression.');
  frame = requestAnimationFrame(loop);

  const initial = host.w?.launchContext;
  if (initial?.storage === 'mirror' && initial.owner === owner) {
    const initialPath = initial.path;
    path.value = initialPath;
    const openWhenConnected = (attempt = 0): void => {
      if (disposed || signal.aborted) return;
      if (!element.isConnected && attempt < 60) setTimeout(() => openWhenConnected(attempt + 1), 16);
      else if (valid()) void open(initialPath);
    };
    queueMicrotask(() => openWhenConnected());
  }

  return {
    element,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      clearWatch();
      canvas.removeEventListener('pointerdown', pointerDown);
      canvas.removeEventListener('pointermove', pointerMove);
      canvas.removeEventListener('pointerup', pointerRelease);
      canvas.removeEventListener('pointercancel', pointerRelease);
      window.removeEventListener('blur', suspend);
      doc.removeEventListener('visibilitychange', visibility);
      windowObserver.disconnect();
      audio.dispose();
      element.replaceChildren();
    },
  };
}
