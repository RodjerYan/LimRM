
import React from "react";

interface Column<T> {
  key: string;
  title: string;
  render: (row: T) => React.ReactNode;
  align?: "left" | "right" | "center";
  width?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  onRowClick?: (row: T) => void;
  empty?: React.ReactNode;
  stickyHeader?: boolean;
}

export default function DataTable<T>({
  columns,
  rows,
  onRowClick,
  empty,
  stickyHeader = true,
}: DataTableProps<T>) {
  if (rows.length === 0) {
    return <>{empty}</>;
  }

  return (
    <div className="rounded-3xl border border-slate-200/70 bg-white/80 overflow-hidden shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
      <div className="overflow-auto custom-scrollbar">
        <table className="w-full text-sm">
          <thead
            className={[
              "bg-white/95 backdrop-blur border-b border-slate-200",
              stickyHeader ? "sticky top-0 z-10" : "",
            ].join(" ")}
          >
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={{ width: col.width }}
                  className={[
                    "px-4 py-3 t-label text-left",
                    col.align === "right"
                      ? "text-right"
                      : col.align === "center"
                      ? "text-center"
                      : "text-left",
                  ].join(" ")}
                >
                  {col.title}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {rows.map((row, idx) => (
              <tr
                key={idx}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={[
                  "transition-colors",
                  onRowClick
                    ? "cursor-pointer hover:bg-slate-50 active:bg-slate-100"
                    : "",
                ].join(" ")}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={[
                      "px-4 py-3 t-body",
                      col.align === "right"
                        ? "text-right"
                        : col.align === "center"
                        ? "text-center"
                        : "text-left",
                    ].join(" ")}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
