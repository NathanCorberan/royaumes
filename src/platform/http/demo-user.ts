import { createMiddleware } from 'hono/factory'
import type { AppEnv } from './types'

export const DEMO_USER_ID = 'demo'

/**
 * Middleware provisoire : toutes les requêtes sont attribuées au même joueur.
 * DETTE TECHNIQUE : à remplacer au TD4 par l'identification du joueur connecté.
 */
export const demoUser = () =>
  createMiddleware<AppEnv>(async (c, next) => {
    c.set('userId', DEMO_USER_ID)
    await next()
  })
