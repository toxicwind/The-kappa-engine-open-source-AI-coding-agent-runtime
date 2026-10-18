function board(name: string) {
  return /(?:^|_)kappacode_board(?:_reset)?$/.test(name)
}

export function file(name: string, value: string) {
  return board(name) ? `// kappacode_change - new file\n${value}` : value
}

export function block(name: string | undefined, source: string, value: string) {
  return (name !== undefined && board(name)) ||
    /kappa_board(?:_message)?|part_session_step_finish_idx|recall_(?:part_search|message_role)_idx/.test(source)
    ? `// kappacode_change start\n${value}\n// kappacode_change end`
    : value
}

export function line(name: string, value: string) {
  return board(name) || name.endsWith("_kappacode_model_usage_index") ? `${value} // kappacode_change` : value
}
