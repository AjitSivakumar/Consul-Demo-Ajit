import type { ResearchElement } from '../../types/deliverables';

function renderBold(text: string): React.ReactNode {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return parts.map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part));
}

export function ResearchCard({ data }: { data: ResearchElement }): React.JSX.Element {
  return (
    <div className="dl-card">
      <div className="dl-card-head">
        <div className="dl-elem-badge dl-e1">01</div>
        <div className="dl-card-head-title">Research summary — answered question with supporting data</div>
        <div className="dl-card-head-sub">{data.comparisonTable ? 'Deep form · graphics included' : 'Deep form'}</div>
      </div>
      <div className="dl-card-body">
        <div className="dl-info-block">
          <div className="dl-info-label">Question surfaced during meeting</div>
          <div className="dl-info-text">{data.question}</div>
        </div>

        <div className="dl-info-block">
          <div className="dl-info-label">Consul&apos;s answer (full form)</div>
          <div className="dl-info-text">{renderBold(data.answer)}</div>
        </div>

        {(data.comparisonTable || data.barChart) && (
          <div className="dl-data-grid">
            {data.comparisonTable && (
              <div className="dl-info-block">
                <div className="dl-info-label">Capability matrix</div>
                <table className="dl-cap-table">
                  <thead>
                    <tr>
                      {data.comparisonTable.columns.map((col, i) => (
                        <th key={i}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.comparisonTable.rows.map((row, ri) => (
                      <tr key={ri}>
                        {row.map((cell, ci) => (
                          <td
                            key={ci}
                            className={cell === '✓' ? 'dl-check' : cell === '✗' ? 'dl-cross' : undefined}
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {data.barChart && (
              <div className="dl-info-block">
                <div className="dl-info-label">Comparative metrics</div>
                <div className="dl-bar-chart" style={{ marginTop: '0.5rem' }}>
                  {data.barChart.map((bar, i) => (
                    <div className="dl-bar-item" key={i}>
                      <div className="dl-bar-meta">
                        <span className="dl-bar-label">{bar.label}</span>
                        <span
                          className={`dl-bar-val ${bar.style === 'primary' ? 'dl-bar-val-teal' : 'dl-bar-val-gray'}`}
                        >
                          {bar.value}%
                        </span>
                      </div>
                      <div className="dl-bar-track">
                        <div
                          className={`dl-bar-fill ${bar.style === 'primary' ? 'dl-bar-fill-teal' : 'dl-bar-fill-gray'}`}
                          style={{ width: `${bar.value}%` }}
                        />
                      </div>
                    </div>
                  ))}
                  {data.barChartNote && <div className="dl-bar-note">{data.barChartNote}</div>}
                </div>
              </div>
            )}
          </div>
        )}

        {data.keyFinding && (
          <div className="dl-finding">
            <div>
              <div className="dl-finding-text">{renderBold(data.keyFinding.text)}</div>
              <div className="dl-finding-source">Source: {data.keyFinding.source}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
