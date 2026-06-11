import { getProcessorRowActionState } from './actions/logActions'

export function ProcessorRowActions({ log, onAction }) {
  const state = getProcessorRowActionState(log)
  if (!state.runnable) {
    return <span className="muted">{state.reason}</span>
  }

  return (
    <div className="processor-row-actions">
      {state.actions.map((action) => (
        <button className="ghost small" type="button" key={action.key} onClick={() => onAction(log, action.key)}>
          {action.label}
        </button>
      ))}
    </div>
  )
}
