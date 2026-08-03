"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type BreadcrumbLabels = Record<string, string | null>;

const PortalBreadcrumbContext = createContext<{
  labels: BreadcrumbLabels;
  setLabels: (labels: BreadcrumbLabels) => void;
} | null>(null);

export function PortalBreadcrumbProvider({ children }: { children: ReactNode }) {
  const [labels, setLabels] = useState<BreadcrumbLabels>({});
  const value = useMemo(() => ({ labels, setLabels }), [labels]);

  return (
    <PortalBreadcrumbContext.Provider value={value}>
      {children}
    </PortalBreadcrumbContext.Provider>
  );
}

export function PortalBreadcrumbData({ labels }: { labels: BreadcrumbLabels }) {
  const setLabels = useContext(PortalBreadcrumbContext)?.setLabels;
  const serializedLabels = JSON.stringify(labels);

  useEffect(() => {
    if (!setLabels) return;

    setLabels(JSON.parse(serializedLabels) as BreadcrumbLabels);
    return () => setLabels({});
  }, [serializedLabels, setLabels]);

  return null;
}

export function usePortalBreadcrumbLabels() {
  return useContext(PortalBreadcrumbContext)?.labels ?? {};
}
