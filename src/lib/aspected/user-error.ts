import { toast } from "sonner"
import { z } from "zod"
import { AspectedApiError } from "./client.ts"
import { DOCS_HASH, type DocsTarget, openDocs } from "@/lib/docs.ts"

/** Title plus next-step copy for a user-facing error toast. */
export type UserFacingError = {
  title: string
  description: string
  docs?: DocsTarget
}

type ServerHint = {
  match: string | RegExp
  title: string
  action: string
  docs?: DocsTarget
}

const SERVER_HINTS: ServerHint[] = [
  {
    match: "Index does not exist",
    title: "Index not found",
    action: "It may have been deleted. Open Indexes and pick one that exists.",
  },
  {
    match: "Document does not exist",
    title: "Document not found",
    action: "Refresh the document list, or check the ID and try again.",
  },
  {
    match: "Index with the same name already exists",
    title: "Index already exists",
    action: "Choose a different name, or delete the existing index first.",
  },
  {
    match: "Maximum number of indexes reached",
    title: "Index limit reached",
    action:
      "Unlicensed servers allow 2 indexes. Delete one, or add a license on the server.",
  },
  {
    match: "Index currently in use",
    title: "Index is busy",
    action: "Wait a moment and try again.",
  },
  {
    match: "Missing bearer token",
    title: "Authentication required",
    action: "Open Server in the sidebar and paste the API token.",
    docs: { page: "security", hash: DOCS_HASH.apiToken },
  },
  {
    match: "Invalid bearer token",
    title: "Authentication failed",
    action: "Open Server in the sidebar and check the API token.",
    docs: { page: "security", hash: DOCS_HASH.apiToken },
  },
  {
    match: "Insufficient access",
    title: "Access denied",
    action: "This token cannot perform that action. Use a token with access.",
    docs: { page: "security", hash: DOCS_HASH.apiToken },
  },
  {
    match: "Both query and document are missing",
    title: "Search needs a query",
    action: "Fill at least one aspect, or provide a query or document in JSON.",
    docs: { page: "resolvers", hash: DOCS_HASH.combiningResolvers },
  },
  {
    match: "Both query and document are provided",
    title: "Search has conflicting input",
    action: "Use either a query or a document, not both.",
    docs: { page: "tutorial", hash: DOCS_HASH.tutorialSearch },
  },
  {
    match: "Invalid JSONPath",
    title: "Invalid JSONPath",
    action: "JSONPath must start with $., for example $.category.",
    docs: { page: "resolvers", hash: DOCS_HASH.jsonPath },
  },
  {
    match: "Invalid resolver settings",
    title: "Invalid aspect settings",
    action: "Check each aspect type and its settings, then try again.",
    docs: { page: "resolvers" },
  },
  {
    match: /licen[cs]e/i,
    title: "License required",
    action: "The dictionary resolver needs a valid license.",
    docs: { page: "resolverDict" },
  },
  {
    match: /Inf\/NaN/i,
    title: "Search weights are out of range",
    action: "Use smaller aspect weights and search again.",
  },
]

/**
 * Turns API, network, and validation failures into a short title and an
 * actionable description for Sonner toasts.
 */
export function toUserFacingError(
  caught: unknown,
  fallbackTitle: string,
): UserFacingError {
  if (caught instanceof AspectedApiError) {
    return fromApiError(caught, fallbackTitle)
  }

  if (caught instanceof z.ZodError) {
    return {
      title: "Invalid input",
      description: withAction(
        z.prettifyError(caught),
        "Correct the highlighted fields and try again.",
      ),
    }
  }

  if (caught instanceof SyntaxError) {
    return {
      title: "Invalid JSON",
      description:
        "The JSON could not be parsed. Check for missing commas, quotes, or brackets.",
    }
  }

  if (isNetworkFailure(caught)) {
    return networkError()
  }

  if (caught instanceof Error && caught.message.trim()) {
    return {
      title: fallbackTitle,
      description: withAction(caught.message, "Fix the input and try again."),
    }
  }

  return {
    title: fallbackTitle,
    description: "Try again. If it keeps failing, check the request inspector.",
  }
}

/**
 * Shows a Sonner error toast with a title and next-step description.
 * Identical copy reuses the same toast id so it replaces instead of stacking.
 *
 * @returns The same copy shown in the toast.
 */
export function toastCaughtError(
  caught: unknown,
  fallbackTitle: string,
): UserFacingError {
  const error = toUserFacingError(caught, fallbackTitle)
  toastUserFacingError(error)
  return error
}

/**
 * Shows a user-facing error toast, replacing any visible toast with the same
 * title and description.
 */
export function toastUserFacingError(error: UserFacingError): void {
  const docs = error.docs
  toast.error(error.title, {
    id: toastId(error),
    description: error.description,
    duration: 8000,
    action: docs
      ? {
        label: "Open docs",
        onClick: () => openDocs(docs.page, docs.hash),
      }
      : undefined,
  })
}

function toastId(error: UserFacingError): string {
  return `${error.title}\n${error.description}`
}

function fromApiError(
  error: AspectedApiError,
  fallbackTitle: string,
): UserFacingError {
  if (error.status === 0 || isNetworkFailure(error)) {
    return networkError()
  }

  const serverMessage = error.message.trim()
  const hint = matchHint(serverMessage)
  if (hint) {
    return {
      title: hint.title,
      description: withAction(serverMessage, hint.action),
      docs: hint.docs,
    }
  }

  if (error.status === 401) {
    return {
      title: "Authentication required",
      description: withAction(
        serverMessage || "The server rejected this request.",
        "Open Server in the sidebar and paste a valid API token.",
      ),
      docs: { page: "security", hash: DOCS_HASH.apiToken },
    }
  }

  if (error.status === 403) {
    return {
      title: "Access denied",
      description: withAction(
        serverMessage || "This token cannot perform that action.",
        "Use a token with access, or pick a different index.",
      ),
      docs: { page: "security", hash: DOCS_HASH.apiToken },
    }
  }

  if (error.status === 404) {
    return {
      title: "Not found",
      description: withAction(
        serverMessage || "The index or document is not on the server.",
        "Refresh the list, or return to Indexes.",
      ),
    }
  }

  if (error.status === 409) {
    return {
      title: "Conflict",
      description: withAction(
        serverMessage || "The server rejected this change.",
        "Refresh and try again.",
      ),
    }
  }

  if (error.status === 422) {
    return {
      title: "Unable to process request",
      description: withAction(
        serverMessage || "The server could not process this request.",
        "Adjust the input and try again.",
      ),
    }
  }

  if (error.status === 502 || error.status === 503 || error.status === 504) {
    return {
      title: "Aspected is unavailable",
      description: withAction(
        serverMessage || "The server did not respond.",
        "Start Aspected, then click Connect in Server.",
      ),
      docs: { page: "gettingStarted" },
    }
  }

  if (error.status >= 500) {
    return {
      title: "Server error",
      description: withAction(
        serverMessage || "Aspected returned an unexpected error.",
        "Retry, or check the server logs.",
      ),
    }
  }

  if (error.status >= 400) {
    return {
      title: fallbackTitle,
      description: withAction(
        serverMessage || `The server returned HTTP ${error.status}.`,
        "Fix the request and try again. The request inspector shows the payload.",
      ),
    }
  }

  return {
    title: fallbackTitle,
    description: withAction(
      serverMessage || "The request failed.",
      "Try again.",
    ),
  }
}

function matchHint(message: string): ServerHint | undefined {
  return SERVER_HINTS.find((hint) =>
    typeof hint.match === "string"
      ? message.includes(hint.match)
      : hint.match.test(message)
  )
}

function networkError(): UserFacingError {
  return {
    title: "Cannot reach Aspected",
    description:
      "Check that the server is running and the Server URL is correct. For a remote origin, enable CORS on the server.",
    docs: { page: "gettingStarted" },
  }
}

function isNetworkFailure(caught: unknown): boolean {
  if (!(caught instanceof Error)) {
    return false
  }

  const message = caught.message.toLowerCase()
  return (
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("load failed") ||
    message.includes("network request failed")
  )
}

function withAction(detail: string, action: string): string {
  const base = detail.trim().replace(/[.]+$/, "")
  if (!base) {
    return action
  }
  if (base.toLowerCase().includes(action.toLowerCase())) {
    return `${base}.`
  }
  return `${base}. ${action}`
}
