import React from 'react';

interface DisclosureSectionProps {
  open: boolean;
  children: React.ReactNode;
  className?: string;
}

/**
 * 平滑展开/收起容器。
 * 用 CSS grid-rows 0fr→1fr 做高度过渡，避免 max-height 估算与 display:none 跳变，
 * 给苹果式的渐显效果；尊重 prefers-reduced-motion。
 */
function DisclosureSection({ open, children, className = '' }: DisclosureSectionProps) {
  return (
    <div
      aria-hidden={!open}
      className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
        open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
      } ${className}`}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}

export default DisclosureSection;
