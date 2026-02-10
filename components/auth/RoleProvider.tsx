
import React, { createContext, useContext, useMemo, useState } from "react";

export type Role = "viewer" | "analyst" | "manager" | "admin";

type Permission =
  | "view_adapta"
  | "view_amp"
  | "view_dashboard"
  | "view_prophet"
  | "edit_addresses"
  | "export_data"
  | "use_saved_views"
  | "use_global_search";

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  viewer: ["view_adapta", "view_amp", "view_dashboard", "use_global_search"],
  analyst: ["view_adapta", "view_amp", "view_dashboard", "use_global_search", "use_saved_views", "export_data"],
  manager: ["view_adapta", "view_amp", "view_dashboard", "view_prophet", "use_global_search", "use_saved_views", "export_data", "edit_addresses"],
  admin: ["view_adapta", "view_amp", "view_dashboard", "view_prophet", "use_global_search", "use_saved_views", "export_data", "edit_addresses"],
};

interface RoleCtx {
  role: Role;
  setRole: (r: Role) => void;
  has: (perm: Permission) => boolean;
}

const Ctx = createContext<RoleCtx | null>(null);

export function RoleProvider({ children, initialRole = "manager" }: { children: React.ReactNode; initialRole?: Role }) {
  const [role, setRole] = useState<Role>(initialRole);

  const value = useMemo<RoleCtx>(() => {
    const perms = new Set(ROLE_PERMISSIONS[role] || []);
    return {
      role,
      setRole,
      has: (p) => perms.has(p),
    };
  }, [role]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRole() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useRole must be used inside RoleProvider");
  return v;
}
