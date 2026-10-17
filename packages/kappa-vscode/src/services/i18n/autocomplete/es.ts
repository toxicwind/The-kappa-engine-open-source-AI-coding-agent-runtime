export const dict = {
  "kappacode:autocomplete.statusBar.enabled": "$(kappa-logo) Autocompletado",
  "kappacode:autocomplete.statusBar.snoozed": "pospuesto",
  "kappacode:autocomplete.statusBar.warning": "$(warning) Autocompletado",
  "kappacode:autocomplete.statusBar.tooltip.basic": "Autocompletado de Kappa Code",
  "kappacode:autocomplete.statusBar.tooltip.noUsableProvider":
    "**No hay ningún modelo de autocompletado configurado**\n\nPara habilitar el autocompletado, añade un perfil con uno de estos proveedores compatibles: {{providers}}.\n\n[Abrir configuración]({{command}})",
  "kappacode:autocomplete.statusBar.tooltip.completionSummary":
    "Se realizaron {{count}} completados entre {{startTime}} y {{endTime}}, con un coste total de {{cost}}.",
  "kappacode:autocomplete.statusBar.tooltip.providerInfo":
    "Autocompletados proporcionados por {{model}} mediante {{provider}}.",
  "kappacode:autocomplete.statusBar.cost.zero": "$0.00",
  "kappacode:autocomplete.statusBar.cost.lessThanCent": "<$0.01",
  "kappacode:autocomplete.codeAction.title": "Kappa Code: Ediciones sugeridas",
  "kappacode:autocomplete.incompatibilityExtensionPopup.message":
    "El autocompletado de Kappa Code está bloqueado por un conflicto con GitHub Copilot. Para solucionarlo, debes deshabilitar las sugerencias en línea de Copilot.",
  "kappacode:autocomplete.incompatibilityExtensionPopup.disableCopilot": "Deshabilitar Copilot",
  "kappacode:autocomplete.incompatibilityExtensionPopup.disableInlineAssist": "Deshabilitar autocompletado",
  "kappacode:autocomplete.creditsExhausted.message":
    "El autocompletado de Kappa Code se ha pausado. Posibles causas: tu cuenta de Kappa no tiene créditos restantes, o tu clave de API configurada (BYOK) alcanzó su límite de cuota. Agrega créditos de Kappa o revisa la configuración de tu clave de API para reanudar el autocompletado.",
  "kappacode:autocomplete.creditsExhausted.addCredits": "Añadir créditos",
  "kappacode:autocomplete.authError.message":
    "El autocompletado de Kappa Code se ha pausado por un problema de autenticación. Posibles causas: no has iniciado sesión en Kappa, o tu clave de API (BYOK) no es válida o falta. Vuelve a iniciar sesión o revisa la configuración de la clave de API de tu proveedor.",
}
