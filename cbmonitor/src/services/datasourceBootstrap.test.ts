import { awaitReconcile, recentlyReloaded, clearReloadMarker } from './datasourceBootstrap';

const backendSrv = { get: jest.fn() };
jest.mock('@grafana/runtime', () => ({
  getBackendSrv: () => backendSrv,
}));

describe('datasourceBootstrap', () => {
  beforeEach(() => {
    backendSrv.get.mockReset();
    sessionStorage.clear();
  });

  test('returns as soon as reconciliation leaves pending', async () => {
    backendSrv.get
      .mockResolvedValueOnce({ reconciliation: { status: 'pending' } })
      .mockResolvedValueOnce({ reconciliation: { status: 'ok' } });

    await expect(awaitReconcile(1, 1000)).resolves.toEqual({ status: 'ok', lastError: undefined });
    expect(backendSrv.get).toHaveBeenCalledTimes(2);
  });

  test('gives up with the last state when reconciliation never finishes', async () => {
    backendSrv.get.mockResolvedValue({ reconciliation: { status: 'pending' } });

    const state = await awaitReconcile(5, 30);
    expect(state.status).toBe('pending');
    expect(backendSrv.get.mock.calls.length).toBeGreaterThan(1);
  });

  test('reports an unreachable backend instead of throwing', async () => {
    backendSrv.get.mockRejectedValue(new Error('502 Bad Gateway'));

    await expect(awaitReconcile(5, 20)).resolves.toEqual({ status: 'unreachable', lastError: '502 Bad Gateway' });
  });

  test('never asks Grafana to show an error toast', async () => {
    backendSrv.get.mockResolvedValue({ reconciliation: { status: 'ok' } });

    await awaitReconcile(1, 100);
    expect(backendSrv.get.mock.calls[0][3]).toEqual({ showErrorAlert: false });
  });

  test('the reload marker expires, so a later visit can reload again', () => {
    const now = Date.now();
    sessionStorage.setItem('cbmonitor:datasource-reload', String(now));
    expect(recentlyReloaded(now + 1_000)).toBe(true);
    expect(recentlyReloaded(now + 61_000)).toBe(false);

    clearReloadMarker();
    expect(recentlyReloaded(now)).toBe(false);
  });
});
