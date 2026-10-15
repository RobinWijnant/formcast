// Domain errors; `onError` in http.ts maps them to status codes.
export class AuthError extends Error {}
export class NotFoundError extends Error {}
export class ConflictError extends Error {}
