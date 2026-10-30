"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useUiText } from "@/i18n/ui-client";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
  type RowSelectionState,
} from "@tanstack/react-table";
import { StatusBadge, statusLabel } from "./StatusBadge";
type Row = {
  id: string;
  number: string;
  status: string;
  recipientName: string;
  destination: string | null;
  plannedAt: string | null;
  source: string;
  documentStatus: string;
  issueCount: number;
  updatedAt: string;
};
function SelectAllCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
}) {
  const t = useUiText();
  return (
    <input
      type="checkbox"
      aria-label={t("Select all rows")}
      checked={checked}
      onChange={onChange}
    />
  );
}
function SelectRowCheckbox({
  number,
  checked,
  onChange,
}: {
  number: string;
  checked: boolean;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
}) {
  const t = useUiText();
  return (
    <input
      type="checkbox"
      aria-label={`${t("Select shipment")} ${number}`}
      checked={checked}
      onChange={onChange}
    />
  );
}
const columns: ColumnDef<Row>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <SelectAllCheckbox
        checked={table.getIsAllPageRowsSelected()}
        onChange={table.getToggleAllPageRowsSelectedHandler()}
      />
    ),
    cell: ({ row }) => (
      <SelectRowCheckbox
        number={row.original.number}
        checked={row.getIsSelected()}
        onChange={row.getToggleSelectedHandler()}
      />
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: (info) => <StatusBadge status={String(info.getValue())} />,
  },
  {
    accessorKey: "number",
    header: "Otpremnica",
    cell: (info) => (
      <Link className="row-link" href={`/shipments/${info.row.original.id}`}>
        {String(info.getValue())}
      </Link>
    ),
  },
  { accessorKey: "recipientName", header: "Kupac" },
  {
    accessorKey: "destination",
    header: "Odredište",
    cell: (info) => (
      <span className="truncate-cell">{String(info.getValue() ?? "—")}</span>
    ),
  },
  {
    accessorKey: "plannedAt",
    header: "Planirana otprema",
    cell: (info) =>
      info.getValue()
        ? new Date(String(info.getValue())).toLocaleDateString("sr-RS")
        : "—",
  },
  {
    accessorKey: "source",
    header: "Izvor",
    cell: (info) => (
      <span className="source-tag">{String(info.getValue())}</span>
    ),
  },
  {
    accessorKey: "documentStatus",
    header: "eOtpremnica",
    cell: (info) => <StatusBadge status={String(info.getValue())} />,
  },
  {
    accessorKey: "issueCount",
    header: "Problemi",
    cell: (info) => Number(info.getValue()) || "—",
  },
  {
    accessorKey: "updatedAt",
    header: "Ažurirano",
    cell: (info) =>
      new Date(String(info.getValue())).toLocaleDateString("sr-RS"),
  },
];
const readOnlyColumns = columns.filter((column) => column.id !== "select");
const validatableStatuses = new Set(["DRAFT", "IMPORTED", "NEEDS_DATA", "READY", "REJECTED"]);
export function ShipmentsTable({ canEdit, filterScope, sources }: { canEdit: boolean; filterScope: string; sources: string[] }) {
  const t = useUiText();
  const router = useRouter();
  const filterKey = `otprema.shipmentFilters.${filterScope}`;
  const [data, setData] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filtersLoaded, setFiltersLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [documentState, setDocumentState] = useState("");
  const [validation, setValidation] = useState("");
  const [date, setDate] = useState("");
  const [sorting, setSorting] = useState<SortingState>([
    { id: "plannedAt", desc: false },
  ]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 15 });
  const [visibility, setVisibility] = useState<VisibilityState>({});
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const saved = localStorage.getItem(filterKey);
    if (saved) {
      try {
        const f = JSON.parse(saved);
        setSearch(f.search ?? "");
        setStatus(f.status ?? "");
        setSource(f.source ?? "");
        setDocumentState(f.documentState ?? "");
        setValidation(f.validation ?? "");
        setDate(f.date ?? "");
        setVisibility({ ...(f.visibility ?? {}), number: true });
      } catch {}
    }
    setFiltersLoaded(true);
  }, [filterKey]);
  useEffect(() => {
    if (!filtersLoaded) return;
    localStorage.setItem(
      filterKey,
      JSON.stringify({
        search,
        status,
        source,
        documentState,
        validation,
        date,
        visibility,
      }),
    );
  }, [filtersLoaded, filterKey, search, status, source, documentState, validation, date, visibility]);
  const loadRows = useCallback(async (signal?: AbortSignal) => {
    const query = new URLSearchParams({
      page: String(pagination.pageIndex + 1),
      pageSize: String(pagination.pageSize),
    });
    if (search.trim()) query.set("search", search.trim());
    if (status) query.set("status", status);
    if (source) query.set("source", source);
    if (documentState) query.set("documentStatus", documentState);
    if (validation) query.set("validation", validation);
    if (date) query.set("date", date);
    if (sorting[0]) {
      query.set("sort", sorting[0].id);
      query.set("desc", String(sorting[0].desc));
    }
    const response = await fetch(`/api/shipments?${query}`, { signal });
    if (!response.ok) throw new Error("Shipments could not be loaded");
    const payload: unknown = await response.json();
    if (
      !payload || typeof payload !== "object" ||
      !Array.isArray((payload as { rows?: unknown }).rows) ||
      typeof (payload as { total?: unknown }).total !== "number"
    ) throw new Error("Shipments could not be loaded");
    const result = payload as { rows: Row[]; total: number };
    setData(result.rows);
    setTotal(result.total);
  }, [pagination, search, status, source, documentState, validation, date, sorting]);
  useEffect(() => {
    if (!filtersLoaded) return;
    const controller = new AbortController();
    setLoading(true);
    void loadRows(controller.signal)
      .catch((error) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setMessage(t(error instanceof Error ? error.message : "Greška"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [filtersLoaded, loadRows, t]);
  function resetPage() {
    setPagination((current) => ({ ...current, pageIndex: 0 }));
    setSelection({});
  }
  // TanStack Table returns mutable table functions by design; React Compiler skips this hook.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns: canEdit ? columns : readOnlyColumns,
    state: { sorting, columnVisibility: { ...visibility, number: true }, rowSelection: selection, pagination },
    onSortingChange: (updater) => {
      setSorting(updater);
      resetPage();
    },
    onPaginationChange: (updater) => {
      setPagination(updater);
      setSelection({});
    },
    onColumnVisibilityChange: setVisibility,
    onRowSelectionChange: setSelection,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    rowCount: total,
    getRowId: (row) => row.id,
  });
  const selectedRows = table.getSelectedRowModel().rows;
  const validatable = selectedRows.filter((row) => validatableStatuses.has(row.original.status));
  const retryable = selectedRows.filter((row) => row.original.status === "FAILED_TRANSIENT");
  async function reloadRows() {
    await loadRows();
  }
  async function bulkValidate() {
    if (!canEdit || validatable.length === 0) return;
    setBusy(true);
    setMessage("");
    try {
      const results = await Promise.allSettled(
        validatable.map((row) =>
          fetch(`/api/shipments/${row.original.id}/validate`, { method: "POST" }),
        ),
      );
      const success = results.filter((result) => result.status === "fulfilled" && result.value.ok).length;
      setMessage(`${success}/${validatable.length} ${t("shipments validated")}`);
      await reloadRows();
      setSelection({});
    } catch (error) {
      setMessage(t(error instanceof Error ? error.message : "Greška"));
    } finally {
      setBusy(false);
    }
  }
  async function bulkRetry() {
    if (!canEdit || retryable.length === 0) return;
    setBusy(true);
    setMessage("");
    try {
      let count = 0;
      for (const row of retryable) {
        const response = await fetch(`/api/shipments/${row.original.id}/trace`);
        if (!response.ok) continue;
        const trace = await response.json();
        const request = trace.requests?.[0];
        if (request) {
          const retryResponse = await fetch(`/api/requests/${request.id}/retry`, {
            method: "POST",
          });
          if (retryResponse.ok) count++;
        }
      }
      setMessage(`${count}/${retryable.length} ${t("retries queued")}`);
      await reloadRows();
      setSelection({});
    } catch (error) {
      setMessage(t(error instanceof Error ? error.message : "Greška"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="filter-bar">
        <input
          aria-label={t("Search shipments")}
          placeholder={t("Pretraži broj, kupca ili adresu…")}
          value={search}
          maxLength={100}
          onChange={(e) => { setSearch(e.target.value); resetPage(); }}
        />
        <select
          aria-label={t("Status")}
          value={status}
          onChange={(e) => { setStatus(e.target.value); resetPage(); }}
        >
          <option value="">{t("Svi statusi")}</option>
          {[
            "DRAFT",
            "IMPORTED",
            "NEEDS_DATA",
            "READY",
            "QUEUED",
            "SUBMITTING",
            "SUBMITTED",
            "ACCEPTED",
            "REJECTED",
            "FAILED_TRANSIENT",
            "CANCELLED",
            "DELIVERED",
          ].map((s) => (
            <option key={s} value={s}>
              {t(statusLabel(s))}
            </option>
          ))}
        </select>
        <select
          aria-label={t("Source")}
          value={source}
          onChange={(e) => { setSource(e.target.value); resetPage(); }}
        >
          <option value="">{t("Svi izvori")}</option>
          {sources.map((s) => (
            <option key={s} value={s}>
              {t(statusLabel(s))}
            </option>
          ))}
        </select>
        <select
          aria-label={t("Validation")}
          value={validation}
          onChange={(e) => { setValidation(e.target.value); resetPage(); }}
        >
          <option value="">{t("Sve provere")}</option>
          <option value="issues">{t("Sa problemima")}</option>
          <option value="clear">{t("Bez problema")}</option>
        </select>
        <select
          aria-label={t("Document state")}
          value={documentState}
          onChange={(e) => { setDocumentState(e.target.value); resetPage(); }}
        >
          <option value="">{t("Svi dokumenti")}</option>
          {[
            "NONE",
            "PREPARED",
            "QUEUED",
            "PROCESSING",
            "SUBMITTED",
            "ACCEPTED",
            "REJECTED",
            "FAILED_TRANSIENT",
            "CANCELLED",
          ].map((s) => (
            <option key={s} value={s}>{t(statusLabel(s))}</option>
          ))}
        </select>
        <input
          aria-label={t("Planned date")}
          type="date"
          value={date}
          onChange={(e) => { setDate(e.target.value); resetPage(); }}
        />
      </div>
      <div className="table-tools">
        <span>
          {total} {t("otpremnica")}{" "}
          {selectedRows.length
            ? `· ${selectedRows.length} ${t("selected")}`
            : ""}
        </span>
        <div>
          {canEdit && (
            <>
              <button
                className="button subtle"
                disabled={busy || validatable.length === 0}
                onClick={bulkValidate}
              >
                {t("Proveri izabrane")}
              </button>
              <button
                className="button subtle"
                disabled={busy || retryable.length === 0}
                onClick={bulkRetry}
              >
                {t("Ponovi neuspele")}
              </button>
            </>
          )}
          <details className="column-menu">
            <summary className="button subtle">{t("Kolone")}</summary>
            <div>
              {table
                .getAllLeafColumns()
                .filter((c) => c.id !== "select" && c.id !== "number")
                .map((c) => (
                  <label key={c.id}>
                    <input
                      type="checkbox"
                      checked={c.getIsVisible()}
                      onChange={c.getToggleVisibilityHandler()}
                    />
                    {t(String(c.columnDef.header))}
                  </label>
                ))}
            </div>
          </details>
        </div>
      </div>
      {message && (
        <p role="status" className="inline-message">
          {message}
        </p>
      )}
      <div className="table-scroll shipments-table-scroll">
        <table className="data-table">
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => (
                  <th key={header.id}>
                    {header.column.getCanSort() ? (
                      <button
                        className="sort-button"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                      {typeof header.column.columnDef.header === "string"
                        ? t(header.column.columnDef.header)
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                      {header.column.getIsSorted()
                        ? header.column.getIsSorted() === "asc"
                          ? " ↑"
                          : " ↓"
                        : ""}
                      </button>
                    ) : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className="clickable-row"
                tabIndex={0}
                aria-label={`${t("Open shipment")} ${row.original.number}`}
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest("a,button,input,select")) return;
                  router.push(`/shipments/${row.original.id}`);
                }}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    router.push(`/shipments/${row.original.id}`);
                  }
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mobile-shipments">
        {table.getRowModel().rows.map((row) => (
          <article className="mobile-shipment-card" key={row.id}>
            <div className="mobile-shipment-top">
              <Link href={`/shipments/${row.original.id}`} className="row-link">
                {row.original.number}
              </Link>
              <StatusBadge status={row.original.status} />
            </div>
            <strong>{row.original.recipientName}</strong>
            <p>{row.original.destination ?? "—"}</p>
            <div className="mobile-shipment-meta">
              <span>{t("Planirana otprema")}: {row.original.plannedAt ? new Date(row.original.plannedAt).toLocaleDateString("sr-RS") : "—"}</span>
              <span>{t("Izvor")}: {row.original.source}</span>
              <span>{t("Problemi")}: {row.original.issueCount}</span>
              <span>{t("eOtpremnica")}: {t(statusLabel(row.original.documentStatus))}</span>
            </div>
            {canEdit && (
              <label className="mobile-shipment-select">
                <input type="checkbox" checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()} />
                {t("Select shipment")}
              </label>
            )}
          </article>
        ))}
      </div>
      {loading ? (
        <div className="empty-state" role="status">{t("Učitavanje…")}</div>
      ) : !table.getRowModel().rows.length ? (
        <div className="empty-state">{t("Nema rezultata za izabrane filtere.")}</div>
      ) : null}
      <div className="pagination">
        <span>
          {t("Strana")} {table.getState().pagination.pageIndex + 1} {t("od")}{" "}
          {table.getPageCount() || 1}
        </span>
        <button
          className="button subtle"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          {t("Prethodna")}{" "}
        </button>
        <button
          className="button subtle"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          {t("Sledeća")}{" "}
        </button>
      </div>
    </>
  );
}
