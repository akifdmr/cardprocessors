import { statusClass } from '../../utils/format'

export function ProcessorList({ processors, selected, catalog, onSelectOperation }) {
  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <p className="eyebrow">Processors</p>
          <h3>Processor Menüsü</h3>
        </div>
      </div>
      <div className="processor-menu">
        {processors.map((processor) => {
          const methods = catalog?.[processor.key]?.methods || (processor.key === 'propelrpay' ? catalog?.propelr?.methods : []) || []
          const health = processor.health || {}
          return (
            <div className={`processor-menu-card ${selected === processor.key ? 'active' : ''}`} key={processor.key}>
              <div className="processor-heading">
                <span className={`health-dot ${statusClass(health.status || (processor.configured ? 'configured' : 'missing config'))}`} />
                <strong>{processor.label || processor.key}</strong>
                <span className={`pill ${statusClass(health.status || (processor.configured ? 'configured' : 'missing config'))}`}>{health.status || (processor.configured ? 'configured' : 'missing config')}</span>
              </div>
              <div className="processor-actions">
                {methods.length ? methods.map((method) => (
                  <button type="button" className="ghost small" key={method.key} onClick={() => onSelectOperation(processor.key, method.key)}>
                    {method.label || method.key}
                  </button>
                )) : <span className="muted">İşlem yok</span>}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
