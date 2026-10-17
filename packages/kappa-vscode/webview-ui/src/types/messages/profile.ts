// Kappa notification types (mirrored from kappa-gateway)
export interface KappacodeNotificationAction {
  actionText: string
  actionURL: string
}

export interface KappacodeNotification {
  id: string
  title: string
  message: string
  action?: KappacodeNotificationAction
  showIn?: string[]
  suggestModelId?: string
}

// Profile types from kappa-gateway
export interface KappacodeBalance {
  balance: number
}

export interface KappaPassState {
  currentPeriodBaseCreditsUsd: number
  currentPeriodUsageUsd: number
  currentPeriodBonusCreditsUsd: number
  nextBillingAt?: string | null
}

export interface ProfileData {
  profile: {
    email: string
    name?: string
    organizations?: Array<{ id: string; name: string; role: string }>
    selectedOrganizationId?: string
    hasPersonalAccount?: boolean
  }
  balance: KappacodeBalance | null
  kappaPass: KappaPassState | null
  currentOrgId: string | null
}
