import { z } from 'zod'

export const appVersion = 'v2'

export const DatabaseStatusSchema = z.enum(['ready', 'not-ready'])
export type DatabaseStatus = z.infer<typeof DatabaseStatusSchema>

export const HealthResponseSchema = z.object({
  version: z.literal(appVersion),
  database: DatabaseStatusSchema,
})
export type HealthResponse = z.infer<typeof HealthResponseSchema>

export function createHealthResponse(database: DatabaseStatus): HealthResponse {
  return HealthResponseSchema.parse({
    version: appVersion,
    database,
  })
}
