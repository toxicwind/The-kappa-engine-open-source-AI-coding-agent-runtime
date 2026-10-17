import * as vscode from "vscode"

export class KappaCodeActionProvider implements vscode.CodeActionProvider {
  static readonly metadata: vscode.CodeActionProviderMetadata = {
    providedCodeActionKinds: [vscode.CodeActionKind.QuickFix, vscode.CodeActionKind.RefactorRewrite],
  }

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    if (range.isEmpty) return []

    const actions: vscode.CodeAction[] = []

    const add = new vscode.CodeAction("Add to Kappa Code", vscode.CodeActionKind.RefactorRewrite)
    add.command = { command: "kappa-code.new.addToContext", title: "Add to Kappa Code" }
    actions.push(add)

    const hasDiagnostics = context.diagnostics.length > 0

    if (hasDiagnostics) {
      const fix = new vscode.CodeAction("Fix with Kappa Code", vscode.CodeActionKind.QuickFix)
      fix.command = { command: "kappa-code.new.fixCode", title: "Fix with Kappa Code" }
      fix.isPreferred = true
      actions.push(fix)
    }

    if (!hasDiagnostics) {
      const explain = new vscode.CodeAction("Explain with Kappa Code", vscode.CodeActionKind.RefactorRewrite)
      explain.command = { command: "kappa-code.new.explainCode", title: "Explain with Kappa Code" }
      actions.push(explain)

      const improve = new vscode.CodeAction("Improve with Kappa Code", vscode.CodeActionKind.RefactorRewrite)
      improve.command = { command: "kappa-code.new.improveCode", title: "Improve with Kappa Code" }
      actions.push(improve)
    }

    return actions
  }
}
