export interface MountResult {
  element: HTMLElement;
  dispose(): void;
}

export function mount(host: any): MountResult {
  const body = host.ui.make('div', 'window-content puppet-app');
  const status = host.ui.make('div', 'app-status', 'Loading Expression Puppet…');
  const controller = new AbortController();
  const abort = () => controller.abort(host.signal?.reason || 'View removed');
  host.signal?.addEventListener('abort', abort, {once: true});
  if (host.signal?.aborted) abort();
  body.append(status);
  let disposed = false;
  let view: {element: HTMLElement; dispose(): void} | null = null;

  queueMicrotask(() => {
    void import('./view/run.js').then(async ({startView}) => {
      if (disposed || controller.signal.aborted) return;
      const candidate = await startView(host, controller.signal);
      if (disposed || controller.signal.aborted) {
        candidate.dispose();
        return;
      }
      view = candidate;
      body.replaceChildren(candidate.element);
    }).catch((error: unknown) => {
      if (!disposed && body.isConnected) {
        status.textContent = 'Could not start Expression Puppet: ' +
          (error instanceof Error ? error.message : 'unknown error');
      }
    });
  });

  return {
    element: body,
    dispose() {
      if (disposed) return;
      disposed = true;
      host.signal?.removeEventListener('abort', abort);
      controller.abort('View removed');
      view?.dispose();
      view = null;
    },
  };
}
