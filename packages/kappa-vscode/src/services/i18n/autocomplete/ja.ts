export const dict = {
  "kappacode:autocomplete.statusBar.enabled": "$(kappa-logo) オートコンプリート",
  "kappacode:autocomplete.statusBar.snoozed": "一時停止中",
  "kappacode:autocomplete.statusBar.warning": "$(warning) オートコンプリート",
  "kappacode:autocomplete.statusBar.tooltip.basic": "Kappa Code オートコンプリート",
  "kappacode:autocomplete.statusBar.tooltip.noUsableProvider":
    "**オートコンプリートモデルが設定されていません**\n\nオートコンプリートを有効にするには、次の対応プロバイダーのいずれかを含むプロファイルを追加してください: {{providers}}。\n\n[設定を開く]({{command}})",
  "kappacode:autocomplete.statusBar.tooltip.completionSummary":
    "{{startTime}} から {{endTime}} までに {{count}} 件の補完を実行し、合計コストは {{cost}} でした。",
  "kappacode:autocomplete.statusBar.tooltip.providerInfo":
    "オートコンプリートは {{provider}} 経由の {{model}} によって提供されています。",
  "kappacode:autocomplete.statusBar.cost.zero": "$0.00",
  "kappacode:autocomplete.statusBar.cost.lessThanCent": "<$0.01",
  "kappacode:autocomplete.codeAction.title": "Kappa Code: 提案された編集",
  "kappacode:autocomplete.incompatibilityExtensionPopup.message":
    "Kappa Code オートコンプリートは GitHub Copilot との競合によりブロックされています。修正するには、Copilot のインライン提案を無効にする必要があります。",
  "kappacode:autocomplete.incompatibilityExtensionPopup.disableCopilot": "Copilot を無効化",
  "kappacode:autocomplete.incompatibilityExtensionPopup.disableInlineAssist": "オートコンプリートを無効化",
  "kappacode:autocomplete.creditsExhausted.message":
    "Kappa Code オートコンプリートは一時停止されました。考えられる原因: Kappa アカウントに残りクレジットがない、または設定済みの API キー (BYOK) がクォータ上限に達しています。オートコンプリートを再開するには、Kappa クレジットを追加するか API キー設定を確認してください。",
  "kappacode:autocomplete.creditsExhausted.addCredits": "クレジットを追加",
  "kappacode:autocomplete.authError.message":
    "Kappa Code オートコンプリートは認証の問題により一時停止されました。考えられる原因: Kappa にサインインしていない、または API キー (BYOK) が無効または不足しています。再度サインインするか、プロバイダーの API キー設定を確認してください。",
}
