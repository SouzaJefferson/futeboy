export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, { ...options, credentials: 'include', headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Não foi possível conectar à API.' }));
    throw new ApiError(response.status, body.error || 'Não foi possível concluir a operação.');
  }
  return response.status === 204 ? undefined as T : response.json();
}
export const send = <T>(path: string, method: string, data?: unknown) => api<T>(path, { method, ...(data !== undefined ? { body: JSON.stringify(data) } : {}) });
