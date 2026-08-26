import { useEffect } from "react"
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react"

/** Props for {@link AnimatedNumber}. */
export type AnimatedNumberProps = {
  value: number
  /** Decimal places to render. Defaults to 3, which suits search distances. */
  digits?: number
  className?: string
}

/**
 * Renders a number that springs to its new value instead of jumping.
 *
 * Playground weights change continuously while a slider is dragged, so tweening
 * the score keeps the ranking readable as it settles. Non-finite values render
 * as a dash, which is how an unscorable row is shown.
 */
export function AnimatedNumber(
  { value, digits = 3, className }: AnimatedNumberProps,
) {
  const reduceMotion = useReducedMotion()
  const target = useMotionValue(value)
  const spring = useSpring(target, { stiffness: 260, damping: 30 })
  const text = useTransform(spring, (current) => current.toFixed(digits))

  useEffect(() => {
    target.set(value)
  }, [target, value])

  if (!Number.isFinite(value)) {
    return <span className={className}>&mdash;</span>
  }

  if (reduceMotion) {
    return <span className={className}>{value.toFixed(digits)}</span>
  }

  return <motion.span className={className}>{text}</motion.span>
}
