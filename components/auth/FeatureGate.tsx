
import React from "react";
import { useRole } from "./RoleProvider";

export default function FeatureGate({
  perm,
  children,
  fallback = null,
}: {
  perm: Parameters<ReturnType<typeof useRole>["has"]>[0];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { has } = useRole();
  return <>{has(perm) ? children : fallback}</>;
}
