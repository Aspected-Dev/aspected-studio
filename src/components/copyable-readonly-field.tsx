import { CopyIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button.tsx"
import { ButtonGroup } from "@/components/ui/button-group.tsx"
import { Field, FieldLabel } from "@/components/ui/field.tsx"
import { Input } from "@/components/ui/input.tsx"
import { toastCaughtError } from "@/lib/aspected/user-error.ts"
import { copyToClipboard } from "@/lib/utils.ts"

/** Props for {@link CopyableReadonlyField}. */
export type CopyableReadonlyFieldProps = {
  /** Associated input id. */
  id: string
  /** Visible field label and copy aria label base. */
  label: string
  /** Value shown in the readonly input and copied on click. */
  value: string
}

/**
 * Readonly field with an adjacent copy button (shadcn ButtonGroup pattern).
 */
export function CopyableReadonlyField({
  id,
  label,
  value,
}: CopyableReadonlyFieldProps) {
  async function copy() {
    try {
      await copyToClipboard(value)
      toast.success(`Copied ${label.toLowerCase()}`)
    } catch {
      toastCaughtError(new Error("Clipboard unavailable"), "Could not copy")
    }
  }

  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <ButtonGroup className="w-full">
        <Input
          id={id}
          value={value}
          readOnly
          className="font-mono"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={`Copy ${label}`}
          onClick={() => void copy()}
        >
          <CopyIcon />
        </Button>
      </ButtonGroup>
    </Field>
  )
}
