import React from "react"
import { Icon } from "./Icon"

interface KappaCodeIconProps {
  size?: string
}

export function KappaCodeIcon({ size = "1.2em" }: KappaCodeIconProps) {
  return <Icon src="/docs/img/kappa-v1.svg" srcDark="/docs/img/kappa-v1-white.svg" alt="Kappa Code Icon" size={size} />
}
