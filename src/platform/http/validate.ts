import { zValidator } from '@hono/zod-validator'
import type { ZodType } from 'zod'

/** Validation JSON commune : toute entrée invalide reçoit une erreur structurée. */
export const validateJson = <T extends ZodType>(schema: T) =>
  zValidator('json', schema, (result, c) => {
    if (!result.success) {
      const message = result.error.issues[0]?.message ?? 'Entrée invalide'
      return c.json({ error: { code: 'INVALID_INPUT' as const, message } }, 400)
    }
  })
