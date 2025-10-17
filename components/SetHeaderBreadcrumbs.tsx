"use client";

import { useEffect } from 'react';
import { useHeader } from '@/contexts/HeaderContext';
import { Breadcrumbs, type BreadcrumbItem } from '@/components/Breadcrumbs';

type Props = {
  items: BreadcrumbItem[];
};

export function SetHeaderBreadcrumbs({ items }: Props) {
  const { setConfig, resetConfig } = useHeader();

  useEffect(() => {
    setConfig({
      visible: true,
      variant: 'full',
      leftContent: <Breadcrumbs items={items} />,
      rightContent: null,
    });
    return () => resetConfig();
  }, [items, resetConfig, setConfig]);

  return null;
}

