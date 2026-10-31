import type { ErrorCode } from '@shared/ipc'

/** An expected failure whose message is safe to show to the user. */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'AppError'
  }
}
