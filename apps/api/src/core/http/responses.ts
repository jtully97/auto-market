/** Explicit non-200 responses a handler can return. Plain values become 200 JSON. */
export class HttpResponse {
  constructor(
    readonly status: number,
    readonly body?: unknown,
    readonly redirectTo?: string,
  ) {}
}

export const created = <T>(body: T) => new HttpResponse(201, body);
export const accepted = <T>(body: T) => new HttpResponse(202, body);
export const noContent = () => new HttpResponse(204);
export const redirect = (url: string) => new HttpResponse(302, undefined, url);
