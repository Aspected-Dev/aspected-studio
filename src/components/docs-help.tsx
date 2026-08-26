import { type ReactNode } from "react"
import { CircleHelpIcon, ExternalLinkIcon } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button.tsx"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field.tsx"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx"
import { DOCS_PAGES, type DocsPage, docsUrl } from "@/lib/docs.ts"
import { cn } from "@/lib/utils.ts"

/** Props for components that always require a docs page reference. */
type DocsPageProps = {
  page: DocsPage
  hash?: string
  label?: string
  /** Tooltip text. Pass `null` to suppress the tooltip content entirely. */
  blurb?: string | null
}

/**
 * Icon button that opens a docs page in a new window.
 * Hover shows a short blurb when one is provided; omit `blurb` to suppress
 * the tooltip content (useful when inline help text already covers it).
 * Click does not navigate Studio.
 * Inside a Badge the control shrinks to the chip height so the icon
 * does not sit in extra left and right gutters.
 */
export function DocsHelpIcon({ page, hash, label, blurb }: DocsPageProps) {
  const title = label ?? DOCS_PAGES[page].title
  // When blurb is explicitly passed use it; otherwise fall back to the catalog.
  // Pass blurb={null} to suppress the tooltip content entirely.
  const text = blurb === null ? null : (blurb ?? DOCS_PAGES[page].blurb)
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <a
              href={docsUrl(page, hash)}
              target="_blank"
              rel="noopener noreferrer"
              data-docs-help=""
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon-xs" }),
                "in-data-[slot=badge]:size-4 in-data-[slot=badge]:rounded-[min(var(--radius-md),6px)]",
              )}
              aria-label={`Open docs: ${title}`}
              onClick={(event) => event.stopPropagation()}
            />
          }
        >
          <CircleHelpIcon />
        </TooltipTrigger>
        {text !== null ? <TooltipContent>{text}</TooltipContent> : null}
      </Tooltip>
    </TooltipProvider>
  )
}

/**
 * Inline text link that opens docs in a new window.
 */
export function DocsTextLink({
  page,
  hash,
  children,
}: DocsPageProps & { children: ReactNode }) {
  return (
    <a
      href={docsUrl(page, hash)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
    >
      {children}
      <ExternalLinkIcon className="size-3" />
    </a>
  )
}

/**
 * Header control that opens the docs page for the current Studio screen.
 * Hover shows a short blurb. Click does not navigate Studio.
 */
export function PageDocsButton({ page, hash, label, blurb }: DocsPageProps) {
  const title = label ?? "Docs"
  const text = blurb ?? DOCS_PAGES[page].blurb
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              nativeButton={false}
              variant="outline"
              render={
                <a
                  href={docsUrl(page, hash)}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            />
          }
        >
          <CircleHelpIcon data-icon="inline-start" />
          {title}
        </TooltipTrigger>
        <TooltipContent>{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

type DocsFieldProps = {
  label: string
  htmlFor?: string
  /** Optional docs page reference. When provided, a help icon is rendered next to the label. */
  page?: DocsPage
  hash?: string
  docsLabel?: string
  blurb?: string | null
  description?: string
  /** Inline validation error message forwarded from React Hook Form. */
  error?: string
  /** Render the label in a monospace font, e.g. for API field names like `idSize`. */
  mono?: boolean
  children: ReactNode
}

/**
 * Form field built on shadcn/ui Field primitives with an optional docs icon
 * and helper text. Pass `error` to show an inline validation message and
 * switch the field into its invalid state.
 */
export function DocsField({
  label,
  htmlFor,
  page,
  hash,
  description,
  docsLabel,
  blurb,
  error,
  mono,
  children,
}: DocsFieldProps) {
  return (
    <Field data-invalid={error ? true : undefined}>
      <div className="flex min-w-0 items-center gap-1">
        <FieldLabel htmlFor={htmlFor}>
          {mono
            ? <span className="font-mono leading-none">{label}</span>
            : label}
        </FieldLabel>
        {page
          ? (
            <DocsHelpIcon
              page={page}
              hash={hash}
              label={docsLabel ?? label}
              blurb={blurb ?? (description ? null : undefined)}
            />
          )
          : null}
      </div>
      {children}
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  )
}
