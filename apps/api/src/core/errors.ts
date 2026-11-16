export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request', details?: unknown) {
    super(400, 'BAD_REQUEST', message, details);
  }
}
export class ValidationError extends AppError {
  constructor(details: unknown, message = 'Some fields need attention') {
    super(422, 'VALIDATION_ERROR', message, details);
  }
}
export class UnauthorizedError extends AppError {
  constructor(message = 'Please sign in') {
    super(401, 'UNAUTHORIZED', message);
  }
}
export class ForbiddenError extends AppError {
  constructor(message = 'You do not have access to this') {
    super(403, 'FORBIDDEN', message);
  }
}
export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(404, 'NOT_FOUND', `${resource} not found`);
  }
}
export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, 'CONFLICT', message);
  }
}
/** Plan limit or feature gate — the UI turns this into an upgrade prompt. */
export class PlanLimitError extends AppError {
  constructor(message: string, details?: { limit: string; planId: string }) {
    super(402, 'PLAN_LIMIT', message, details);
  }
}
export class InsufficientCreditsError extends AppError {
  constructor(required: number, available: number) {
    super(402, 'INSUFFICIENT_CREDITS', `This needs ${required} credits — you have ${available}.`, {
      required,
      available,
    });
  }
}
export class RateLimitError extends AppError {
  constructor(message = 'Too many requests, slow down a little') {
    super(429, 'RATE_LIMITED', message);
  }
}
export class ExternalServiceError extends AppError {
  constructor(service: string, message: string, details?: unknown) {
    super(502, 'EXTERNAL_SERVICE_ERROR', `${service}: ${message}`, details);
  }
}
