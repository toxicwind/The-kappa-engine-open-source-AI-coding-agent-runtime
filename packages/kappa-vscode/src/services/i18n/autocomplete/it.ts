export const dict = {
  "kappacode:autocomplete.statusBar.enabled": "$(kappa-logo) Completamento automatico",
  "kappacode:autocomplete.statusBar.snoozed": "posticipato",
  "kappacode:autocomplete.statusBar.warning": "$(warning) Completamento automatico",
  "kappacode:autocomplete.statusBar.tooltip.basic": "Completamento automatico Kappa Code",
  "kappacode:autocomplete.statusBar.tooltip.noUsableProvider":
    "**Nessun modello di completamento automatico configurato**\n\nPer abilitare il completamento automatico, aggiungi un profilo con uno di questi provider supportati: {{providers}}.\n\n[Apri impostazioni]({{command}})",
  "kappacode:autocomplete.statusBar.tooltip.completionSummary":
    "Eseguiti {{count}} completamenti tra {{startTime}} e {{endTime}}, per un costo totale di {{cost}}.",
  "kappacode:autocomplete.statusBar.tooltip.providerInfo":
    "Completamenti automatici forniti da {{model}} tramite {{provider}}.",
  "kappacode:autocomplete.statusBar.cost.zero": "$0.00",
  "kappacode:autocomplete.statusBar.cost.lessThanCent": "<$0.01",
  "kappacode:autocomplete.codeAction.title": "Kappa Code: modifiche suggerite",
  "kappacode:autocomplete.incompatibilityExtensionPopup.message":
    "Il completamento automatico di Kappa Code è bloccato da un conflitto con GitHub Copilot. Per risolvere il problema, devi disabilitare i suggerimenti inline di Copilot.",
  "kappacode:autocomplete.incompatibilityExtensionPopup.disableCopilot": "Disabilita Copilot",
  "kappacode:autocomplete.incompatibilityExtensionPopup.disableInlineAssist": "Disabilita completamento automatico",
  "kappacode:autocomplete.creditsExhausted.message":
    "Il completamento automatico di Kappa Code è stato messo in pausa. Possibili cause: il tuo account Kappa non ha crediti residui, oppure la chiave API configurata (BYOK) ha raggiunto il limite di quota. Aggiungi crediti Kappa o controlla la configurazione della chiave API per riprendere il completamento automatico.",
  "kappacode:autocomplete.creditsExhausted.addCredits": "Aggiungi crediti",
  "kappacode:autocomplete.authError.message":
    "Il completamento automatico di Kappa Code è stato messo in pausa a causa di un problema di autenticazione. Possibili cause: non hai effettuato l’accesso a Kappa, oppure la tua chiave API (BYOK) non è valida o manca. Accedi di nuovo o controlla le impostazioni della chiave API del provider.",
}
