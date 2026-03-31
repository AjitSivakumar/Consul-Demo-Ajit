import type { ActionElement } from '../../types/deliverables';

function renderBold(text: string): React.ReactNode {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return parts.map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part));
}

export function ActionList({ data }: { data: ActionElement }): React.JSX.Element {
  return (
    <div className="dl-card">
      <div className="dl-card-head">
        <div className="dl-elem-badge dl-e3">03</div>
        <div className="dl-card-head-title">Analyst action items — prep for follow-up</div>
        <div className="dl-card-head-sub">{data.items.length} actions · gaps to close</div>
      </div>
      <div className="dl-card-body">
        <div className="dl-action-list">
          {data.items.map((item, i) => (
            <div className="dl-action-row" key={i}>
              <div className="dl-action-num">{item.num}</div>
              <div>
                <div className="dl-action-title">{item.title}</div>
                <div className="dl-action-desc">{renderBold(item.description)}</div>

                {item.gapTags && item.gapTags.length > 0 && (
                  <div className="dl-gap-pills">
                    {item.gapTags.map((tag, ti) => (
                      <span className="dl-gap-pill" key={ti}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {item.intel && (
                  <div className="dl-intel-block">
                    <div className="dl-intel-label">{item.intel.label}</div>
                    <div className="dl-intel-text">{renderBold(item.intel.text)}</div>
                    <div className="dl-intel-source">{item.intel.source}</div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
