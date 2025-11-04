"use client";

import { createContext, useContext, useState, ReactNode, useCallback, useMemo, MouseEvent } from 'react';

export type HeaderVariant = 'full' | 'short';

export interface HeaderConfig {
  variant: HeaderVariant;
  title?: string;
  titleHref?: string;
  onTitleClick?: ((event: MouseEvent<HTMLAnchorElement>) => boolean | void) | null;
  leftContent?: ReactNode;
  rightContent?: ReactNode;
  visible: boolean;
}

interface HeaderContextType {
  config: HeaderConfig;
  setConfig: (config: Partial<HeaderConfig>) => void;
  resetConfig: () => void;
}

const defaultConfig: HeaderConfig = {
  variant: 'full',
  title: undefined,
  titleHref: '/',
  onTitleClick: null,
  leftContent: null,
  rightContent: null,
  visible: true,
};

const HeaderContext = createContext<HeaderContextType | null>(null);

export function HeaderProvider({ children }: { children: ReactNode }) {
  const [config, setConfigState] = useState<HeaderConfig>(defaultConfig);

  const setConfig = useCallback((newConfig: Partial<HeaderConfig>) => {
    setConfigState(prev => ({ ...prev, ...newConfig }));
  }, []);

  const resetConfig = useCallback(() => {
    setConfigState(defaultConfig);
  }, []);

  const value = useMemo(() => ({
    config,
    setConfig,
    resetConfig
  }), [config, setConfig, resetConfig]);

  return (
    <HeaderContext.Provider value={value}>
      {children}
    </HeaderContext.Provider>
  );
}

export function useHeader() {
  const context = useContext(HeaderContext);
  if (!context) {
    throw new Error('useHeader must be used within a HeaderProvider');
  }
  return context;
}
