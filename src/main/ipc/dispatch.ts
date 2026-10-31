import type { z } from 'zod'
import type { ApiResult, Channel, Contract, ErrorCode } from '@shared/ipc'
import { AppError } from '../errors'

export interface Route<C extends Channel> {
  input: z.ZodType<Contract[C]['req']>
  run(req: Contract[C]['req']): Contract[C]['res'] | Promise<Contract[C]['res']>
}

export type Routes = { [C in Channel]: Route<C> }

export function failure(code: ErrorCode, message: string): ApiResult<never> {
  return { ok: false, error: { code, message } }
}

/** Validates one request and runs it. Everything the renderer sends is treated as untrusted. */
export async function dispatch<C extends Channel>(
  route: Route<C>,
  payload: unknown
): Promise<ApiResult<Contract[C]['res']>> {
  const parsed = route.input.safeParse(payload)
  if (!parsed.success) return failure('VALIDATION', parsed.error.issues[0].message)

  try {
    return { ok: true, data: await route.run(parsed.data) }
  } catch (err) {
    if (err instanceof AppError) return failure(err.code, err.message)
    console.error('IPC handler failed:', err)
    return failure('INTERNAL', 'Something went wrong. Please try again.')
  }
}
