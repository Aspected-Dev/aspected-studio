import type { SVGProps } from "react"
import { cn } from "@/lib/utils.ts"

/**
 * Aspected mark used in the Studio chrome (sidebar brand, etc.).
 */
export function AspectedLogo({
  className,
  ...props
}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 5616 5841"
      fill="none"
      aria-hidden
      className={cn("shrink-0", className)}
      {...props}
    >
      <path
        d="M5616 5840.5L3700 1709.5L2755.24 3584.5L4981.5 5840.5H5616Z"
        fill="url(#aspected-logo-gradient)"
      />
      <path
        d="M0 5840.5L2858.5 0L3700 1709.5L1618.5 5840.5H0Z"
        fill="#005CFC"
      />
      <defs>
        <linearGradient
          id="aspected-logo-gradient"
          x1="2935"
          y1="2441.5"
          x2="5781.5"
          y2="6491.5"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#0040B2" />
          <stop offset="1" stopColor="#005BFB" />
        </linearGradient>
      </defs>
    </svg>
  )
}
