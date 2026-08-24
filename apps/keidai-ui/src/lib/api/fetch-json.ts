export async function readErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  return body?.error ?? fallback;
}

export async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, `API request failed: ${response.status}`),
    );
  }
  return (await response.json()) as T;
}

export async function fetchJsonWithBody<T>(
  path: string,
  init: RequestInit,
): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, `API request failed: ${response.status}`),
    );
  }
  return (await response.json()) as T;
}

export async function sendNoContent(
  path: string,
  init: RequestInit,
): Promise<void> {
  const response = await fetch(path, init);
  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, `API request failed: ${response.status}`),
    );
  }
}
