import type { QAElement } from '../../types/deliverables';

function renderBold(text: string): React.ReactNode {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return parts.map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part));
}

const TAG_STYLE_MAP: Record<string, string> = {
  T: 'dl-tag-tech',
  I: 'dl-tag-tech',
  P: 'dl-tag-price',
  C: 'dl-tag-price',
};

function tagClass(tag: string): string {
  const firstChar = tag.charAt(0).toUpperCase();
  return TAG_STYLE_MAP[firstChar] || 'dl-tag-tech';
}

export function QASection({ data }: { data: QAElement }): React.JSX.Element {
  const totalItems = data.categories.reduce((sum, cat) => sum + cat.items.length, 0);
  const subtitle = data.categories.map((c) => `${c.items.length} ${c.label.toLowerCase()}`).join(' · ');

  return (
    <div className="dl-card">
      <div className="dl-card-head">
        <div className="dl-elem-badge dl-e2">02</div>
        <div className="dl-card-head-title">Proactive questions the customer may ask</div>
        <div className="dl-card-head-sub">{totalItems} total · {subtitle}</div>
      </div>
      <div className="dl-card-body">
        {data.categories.map((category, ci) => (
          <div key={ci}>
            <div className="dl-divider" style={ci > 0 ? { marginTop: '0.5rem' } : undefined}>
              <div className="dl-divider-line" />
              <div className="dl-divider-label">{category.label}</div>
              <div className="dl-divider-line" />
            </div>

            <div className="dl-qa-list">
              {category.items.map((item, qi) => (
                <div className="dl-qa-row" key={qi}>
                  <div className={`dl-qa-tag ${tagClass(item.tag)}`}>{item.tag}</div>
                  <div>
                    <div className="dl-qa-q">{item.question}</div>
                    <div className="dl-qa-a">{renderBold(item.answer)}</div>
                    {item.source && <div className="dl-qa-source">{item.source}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
