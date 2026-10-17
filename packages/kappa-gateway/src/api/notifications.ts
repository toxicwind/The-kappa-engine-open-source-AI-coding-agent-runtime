import { z } from "zod"
import { KILO_API_BASE } from "./constants.js"
import { getDefaultHeaders, buildKappaHeaders } from "../headers.js"

/**
 * Kappa notification schema
 */
export const KappacodeNotificationSchema = z.object({
  id: z.string(),
  title: z.string(),
  message: z.string(),
  action: z
    .object({
      actionText: z.string(),
      actionURL: z.string(),
    })
    .optional(),
  showIn: z.array(z.string()).optional(),
  suggestModelId: z.string().optional(),
})

export type KappacodeNotification = z.infer<typeof KappacodeNotificationSchema>

const NotificationsResponseSchema = z.object({
  notifications: z.array(KappacodeNotificationSchema),
})

const NOTIFICATIONS_TIMEOUT_MS = 5000

/**
 * Fetch notifications from Kappa API
 *
 * @param options - Configuration with token and optional organization ID
 * @returns Array of notifications from the Kappa API (clients filter by showIn)
 */
export async function fetchKappacodeNotifications(options: {
  kappacodeToken?: string
  kappacodeOrganizationId?: string
}): Promise<KappacodeNotification[]> {
  const token = options.kappacodeToken
  if (!token) return []

  const url = `${KILO_API_BASE}/api/users/notifications`

  try {
    const response = await fetch(url, {
      headers: {
        ...getDefaultHeaders(),
        ...buildKappaHeaders(undefined, { kappacodeOrganizationId: options.kappacodeOrganizationId }),
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(NOTIFICATIONS_TIMEOUT_MS),
    })

    if (!response.ok) return []

    const json = await response.json()
    const result = NotificationsResponseSchema.safeParse(json)

    if (!result.success) return []

    return result.data.notifications
  } catch {
    return []
  }
}
