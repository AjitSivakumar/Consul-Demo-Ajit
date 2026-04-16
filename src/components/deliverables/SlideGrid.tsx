import type { SlideElement } from '../../types/deliverables';

const CHIP_CLASS: Record<string, string> = {
  teal: 'dl-chip-teal',
  blue: 'dl-chip-blue',
  gray: 'dl-chip-gray',
};

export function SlideGrid({ data }: { data: SlideElement }): React.JSX.Element {
  const resolved = data.slides.filter((s) => s.status === 'resolved').length;
  const pending = data.slides.length - resolved;

  return (
    <div className="dl-card">
      <div className="dl-card-head">
        <div className="dl-elem-badge dl-e4">04</div>
        <div className="dl-card-head-title">Slide deck — leave-behind</div>
        <div className="dl-card-head-sub">
          {resolved} resolved{pending > 0 ? ` · ${pending} pending` : ''}
        </div>
      </div>
      <div className="dl-card-body">
        <div className="dl-slide-grid">
          {data.slides.map((slide, i) => (
            <div className="dl-slide-wrap" key={i}>
              <div className="dl-slide-num-label">{slide.label}</div>
              <div className={`dl-slide-thumb${slide.status === 'pending' ? ' pending' : ''}`}>
                <div className="dl-slide-corner" />
                <div className={slide.status === 'pending' ? 'dl-slide-t-muted' : 'dl-slide-t'}>
                  {slide.title}
                </div>
                <div>
                  {slide.chips && slide.chips.length > 0 && (
                    <div className="dl-slide-chips">
                      {slide.chips.map((chip, ci) => (
                        <span className={`dl-slide-chip ${CHIP_CLASS[chip.style] || 'dl-chip-gray'}`} key={ci}>
                          {chip.text}
                        </span>
                      ))}
                    </div>
                  )}

                  {slide.miniChart &&
                    slide.miniChart.map((bar, bi) => (
                      <div className="dl-slide-mini-bar-row" key={bi}>
                        <span style={{ fontSize: 9, color: bar.style === 'primary' ? 'var(--dl-teal)' : 'var(--dl-ink3)', minWidth: 60 }}>
                          {bar.label}
                        </span>
                        <div className="dl-slide-mini-track">
                          <div
                            className={`dl-slide-mini-fill ${bar.style === 'primary' ? 'dl-bar-fill-teal' : 'dl-bar-fill-gray'}`}
                            style={{ width: `${bar.value}%` }}
                          />
                        </div>
                        <span
                          className="dl-slide-mini-label"
                          style={{ color: bar.style === 'primary' ? 'var(--dl-teal-mid)' : 'var(--dl-ink3)' }}
                        >
                          {bar.value}%
                        </span>
                      </div>
                    ))}

                  {(slide.bullets?.length ?? 0) > 0 && !slide.chips && !slide.miniChart && (
                    <div className="dl-slide-b">
                      {(slide.bullets ?? []).map((b, bi) => (
                        <span key={bi}>
                          {b}
                          {bi < (slide.bullets?.length ?? 0) - 1 ? ' · ' : ''}
                        </span>
                      ))}
                    </div>
                  )}

                  {slide.status === 'pending' && slide.pendingNote && (
                    <div className="dl-pending-label" style={{ marginTop: 8 }}>
                      ⚠ {slide.pendingNote}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {data.summary && <div className="dl-slide-note">{data.summary}</div>}
      </div>
    </div>
  );
}
