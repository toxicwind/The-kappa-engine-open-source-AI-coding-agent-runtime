// English runtime translations for autocomplete (kappacode:autocomplete.* namespace)
// Source: src/i18n/locales/en/kappacode.json → "autocomplete" section

export const dict = {
  "kappacode:autocomplete.statusBar.enabled": "$(kappa-logo) Autocomplete",
  "kappacode:autocomplete.statusBar.snoozed": "snoozed",
  "kappacode:autocomplete.statusBar.warning": "$(warning) Autocomplete",
  "kappacode:autocomplete.statusBar.tooltip.basic": "Kappa Code Autocomplete",
  "kappacode:autocomplete.statusBar.tooltip.noUsableProvider":
    "**No autocomplete model configured**\n\nTo enable autocomplete, add a profile with one of these supported providers: {{providers}}.\n\n[Open Settings]({{command}})",
  "kappacode:autocomplete.statusBar.tooltip.completionSummary":
    "Performed {{count}} completions between {{startTime}} and {{endTime}}, for a total cost of {{cost}}.",
  "kappacode:autocomplete.statusBar.tooltip.providerInfo": "Autocompletions provided by {{model}} via {{provider}}.",
  "kappacode:autocomplete.statusBar.cost.zero": "$0.00",
  "kappacode:autocomplete.statusBar.cost.lessThanCent": "<$0.01",
  "kappacode:autocomplete.codeAction.title": "Kappa Code: Suggested Edits",
  "kappacode:autocomplete.incompatibilityExtensionPopup.message":
    "The Kappa Code Autocomplete is being blocked by a conflict with GitHub Copilot. To fix this, you must disable Copilot's inline suggestions.",
  "kappacode:autocomplete.incompatibilityExtensionPopup.disableCopilot": "Disable Copilot",
  "kappacode:autocomplete.incompatibilityExtensionPopup.disableInlineAssist": "Disable Autocomplete",
  "kappacode:autocomplete.creditsExhausted.message":
    "Kappa Code Autocomplete has been paused. Possible causes: your Kappa account has no remaining credits, or your configured API key (BYOK) has reached its quota limit. Add Kappa credits or check your API key configuration to resume autocomplete.",
  "kappacode:autocomplete.creditsExhausted.addCredits": "Add Credits",
  "kappacode:autocomplete.authError.message":
    "Kappa Code Autocomplete has been paused due to an authentication issue. Possible causes: you are not signed in to Kappa, or your API key (BYOK) is invalid or missing. Please sign in again or check your provider API key settings.",
}
