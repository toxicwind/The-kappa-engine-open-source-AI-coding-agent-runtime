import { dict as app } from "../../i18n/fr"
import { dict as ui } from "@kappacode/kappa-ui/i18n/fr"
import { dict as kappa } from "@kappacode/kappa-i18n/fr"
import { dict as english } from "../../../agent-manager/i18n/en"
import { dict as am } from "../../../agent-manager/i18n/fr"

export default function dictionary(base: Record<string, string>): Record<string, string> {
  return { ...base, ...app, ...ui, ...kappa, ...english, ...am }
}
