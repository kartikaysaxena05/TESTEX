import React, { createContext, useContext, useState, useRef } from 'react';

interface TabsContextValue {
  activeTab: string;
  setActiveTab: (value: string) => void;
  baseId: string;
}

const TabsContext = createContext<TabsContextValue | null>(null);

export interface TabsProps {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  className?: string;
  children: React.ReactNode;
}

export function Tabs({ value, defaultValue = '', onChange, className = '', children }: TabsProps) {
  const [internalTab, setInternalTab] = useState(defaultValue);
  const baseIdRef = useRef(`tabs-${Math.random().toString(36).substring(2, 9)}`);

  const activeTab = value !== undefined ? value : internalTab;

  const handleTabChange = (newTab: string) => {
    if (value === undefined) {
      setInternalTab(newTab);
    }
    onChange?.(newTab);
  };

  return (
    <TabsContext.Provider
      value={{
        activeTab,
        setActiveTab: handleTabChange,
        baseId: baseIdRef.current,
      }}
    >
      <div className={`tabs-container ${className}`.trim()}>{children}</div>
    </TabsContext.Provider>
  );
}

export type TabListProps = React.HTMLAttributes<HTMLDivElement>;

export function TabList({ className = '', children, ...rest }: TabListProps) {
  const listRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const list = listRef.current;
    if (!list) return;

    const tabs = Array.from(
      list.querySelectorAll<HTMLButtonElement>('button[role="tab"]:not(:disabled)'),
    );
    if (tabs.length === 0) return;

    const activeIndex = tabs.findIndex(tab => tab === document.activeElement);
    if (activeIndex === -1) return;

    let targetIndex = -1;

    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        targetIndex = (activeIndex + 1) % tabs.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        targetIndex = (activeIndex - 1 + tabs.length) % tabs.length;
        break;
      case 'Home':
        e.preventDefault();
        targetIndex = 0;
        break;
      case 'End':
        e.preventDefault();
        targetIndex = tabs.length - 1;
        break;
      default:
        break;
    }

    if (targetIndex !== -1) {
      const targetTab = tabs[targetIndex];
      if (targetTab) {
        targetTab.focus();
        targetTab.click();
      }
    }
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      className={`tab-list ${className}`.trim()}
      onKeyDown={handleKeyDown}
      {...rest}
    >
      {children}
    </div>
  );
}

export interface TabProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}

export function Tab({ value, disabled = false, className = '', children, ...rest }: TabProps) {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('Tab must be used within a Tabs component');

  const isSelected = ctx.activeTab === value;
  const tabId = `${ctx.baseId}-tab-${value}`;
  const panelId = `${ctx.baseId}-panel-${value}`;

  return (
    <button
      id={tabId}
      type="button"
      role="tab"
      aria-selected={isSelected}
      aria-controls={panelId}
      tabIndex={isSelected ? 0 : -1}
      disabled={disabled}
      className={`tab-item ${className}`.trim()}
      onClick={() => ctx.setActiveTab(value)}
      {...rest}
    >
      {children}
    </button>
  );
}

export type TabPanelProps = React.HTMLAttributes<HTMLDivElement> & {
  value: string;
};

export function TabPanel({ value, className = '', children, ...rest }: TabPanelProps) {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('TabPanel must be used within a Tabs component');

  const isSelected = ctx.activeTab === value;
  const tabId = `${ctx.baseId}-tab-${value}`;
  const panelId = `${ctx.baseId}-panel-${value}`;

  return (
    <div
      id={panelId}
      role="tabpanel"
      aria-labelledby={tabId}
      hidden={!isSelected}
      tabIndex={0}
      className={`tab-panel ${className}`.trim()}
      {...rest}
    >
      {isSelected ? children : null}
    </div>
  );
}
