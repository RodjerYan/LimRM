
import React from "react";
import { useRole, Role } from "./RoleProvider";

export default function RoleSwitcher() {
  const { role, setRole } = useRole();

  return (
    <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <span className="text-[10px] uppercase tracking-widest text-slate-500 font-black">Role</span>
      <select
        value={role}
        onChange={(e) => setRole(e.target.value as Role)}
        className="text-xs font-bold text-slate-900 outline-none bg-transparent cursor-pointer"
      >
        <option value="viewer">viewer</option>
        <option value="analyst">analyst</option>
        <option value="manager">manager</option>
        <option value="admin">admin</option>
      </select>
    </div>
  );
}
