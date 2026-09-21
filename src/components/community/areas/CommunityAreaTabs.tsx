import { Fragment } from 'react';
import { GuardedLink } from '../../common/GuardedLink';

export interface CommunityAreaTabItem {
  to: string;
  label: string;
  active: boolean;
}

export function CommunityAreaTabs({ items }: { items: CommunityAreaTabItem[] }) {
  return (
    <div role="tablist" className="tabs tabs-box flex-wrap justify-start">
      {items.map((item) => (
        <Fragment key={item.to}>
          <GuardedLink
            to={item.to}
            role="tab"
            ariaSelected={item.active}
            className={`tab whitespace-nowrap ${item.active ? 'tab-active' : ''}`}
          >
            {item.label}
          </GuardedLink>
        </Fragment>
      ))}
    </div>
  );
}
