import { motion } from "motion/react"
import { TableRow } from "@/components/ui/table.tsx"

/**
 * Stock table row driven by motion so re-ranks animate.
 *
 * `TableRow` spreads its props onto a `tr`, and React 19 passes `ref` through
 * that spread, so motion can measure the node without the shadcn file changing.
 */
export const MotionTableRow = motion.create(TableRow)
