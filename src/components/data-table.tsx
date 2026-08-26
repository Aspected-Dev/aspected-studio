import type { KeyboardEvent, MouseEvent, ReactNode } from "react"
import { MoreHorizontalIcon } from "lucide-react"
import {
  type ColumnDef,
  type PaginationState,
  type RowData,
  type Updater,
  useTable,
} from "@tanstack/react-table"
import { useNavigate } from "react-router"
import { Button } from "@/components/ui/button.tsx"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx"
import {
  type DataTableFeatures,
  features,
} from "@/components/data-table-features.ts"

const ROW_CLICK_EXCLUDED =
  "a, button, input, select, textarea, label, [role='button'], [role='link'], [role='checkbox'], [role='menuitem'], [data-slot='checkbox'], [data-slot='dropdown-menu-trigger']"

/**
 * True when a row click started on a nested control that should keep its own
 * behavior.
 */
function isRowClickExcluded(target: EventTarget | null): boolean {
  return target instanceof Element &&
    target.closest(ROW_CLICK_EXCLUDED) !== null
}

type DataTablePagination = {
  pageIndex: number
  pageSize: number
  rowCount: number
  onPageIndexChange: (pageIndex: number) => void
  label?: ReactNode
}

type DataTableProps<TData extends RowData> = {
  columns: ColumnDef<DataTableFeatures, TData>[]
  data: TData[]
  getRowId?: (originalRow: TData, index: number) => string
  selectedRowId?: string
  pagination?: DataTablePagination
  /** Navigate to this path when a body row is activated. */
  getRowHref?: (row: TData) => string | undefined
  /** Called when a body row is activated and `getRowHref` did not navigate. */
  onRowClick?: (row: TData) => void
}

/**
 * shadcn Data Table built on TanStack Table v9.
 *
 * Pass `getRowHref` or `onRowClick` to make body rows activatable. Nested
 * links, buttons, and other controls keep their own click behavior.
 * Column `meta.className` is applied to body cells only.
 */
export function DataTable<TData extends RowData>({
  columns,
  data,
  getRowId,
  selectedRowId,
  pagination,
  getRowHref,
  onRowClick,
}: DataTableProps<TData>) {
  const navigate = useNavigate()
  const table = useTable({
    features,
    data,
    columns,
    getRowId,
    manualPagination: pagination !== undefined,
    rowCount: pagination?.rowCount,
    state: {
      pagination: pagination
        ? {
          pageIndex: pagination.pageIndex,
          pageSize: pagination.pageSize,
        }
        : { pageIndex: 0, pageSize: Number.POSITIVE_INFINITY },
    },
    onPaginationChange: pagination
      ? (updater: Updater<PaginationState>) => {
        const current: PaginationState = {
          pageIndex: pagination.pageIndex,
          pageSize: pagination.pageSize,
        }
        const next = typeof updater === "function" ? updater(current) : updater
        if (next.pageIndex !== current.pageIndex) {
          pagination.onPageIndexChange(next.pageIndex)
        }
      }
      : undefined,
  })

  function activateRow(original: TData) {
    const href = getRowHref?.(original)
    if (href) {
      navigate(href)
      return
    }
    onRowClick?.(original)
  }

  function handleRowClick(
    event: MouseEvent<HTMLTableRowElement>,
    original: TData,
  ) {
    if (event.defaultPrevented || isRowClickExcluded(event.target)) {
      return
    }
    activateRow(original)
  }

  function handleRowKeyDown(
    event: KeyboardEvent<HTMLTableRowElement>,
    original: TData,
  ) {
    if (event.key !== "Enter" || event.defaultPrevented) {
      return
    }
    if (isRowClickExcluded(event.target)) {
      return
    }
    event.preventDefault()
    activateRow(original)
  }

  return (
    <div className="min-w-0 max-w-full">
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : <table.FlexRender header={header} />}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length
              ? table.getRowModel().rows.map((row) => {
                const href = getRowHref?.(row.original)
                const clickable = Boolean(href) || onRowClick !== undefined
                return (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() || row.id === selectedRowId
                      ? "selected"
                      : undefined}
                    className={clickable ? "cursor-pointer" : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    onClick={clickable
                      ? (event) => handleRowClick(event, row.original)
                      : undefined}
                    onKeyDown={clickable
                      ? (event) => handleRowKeyDown(event, row.original)
                      : undefined}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={cell.column.columnDef.meta?.className}
                      >
                        <table.FlexRender cell={cell} />
                      </TableCell>
                    ))}
                  </TableRow>
                )
              })
              : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center"
                  >
                    No results.
                  </TableCell>
                </TableRow>
              )}
          </TableBody>
        </Table>
      </div>
      {pagination
        ? (
          <div className="flex items-center justify-end space-x-2 py-4">
            {pagination.label
              ? (
                <div className="flex-1 text-sm text-muted-foreground">
                  {pagination.label}
                </div>
              )
              : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Next
            </Button>
          </div>
        )
        : null}
    </div>
  )
}

type DataTableRowActionsProps = {
  children: ReactNode
}

/**
 * Ghost icon button that opens a row-actions dropdown.
 */
export function DataTableRowActions({ children }: DataTableRowActionsProps) {
  return (
    <div
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" className="h-8 w-8 p-0" />}
        >
          <span className="sr-only">Open menu</span>
          <MoreHorizontalIcon className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-max min-w-40 whitespace-nowrap"
        >
          {children}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
