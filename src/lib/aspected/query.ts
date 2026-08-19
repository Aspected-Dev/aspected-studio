import { z } from "zod";
import type { SearchIndexRequest } from "./types.ts";

/** A single aspect field on the sparse search form. */
export type SparseAspectInput = {
  name: string;
  value: string;
  weight: string;
};

/**
 * Builds a search body from the sparse form. Blank aspect values are omitted
 * so those dimensions stay undefined on the server.
 */
export function buildSparseSearchRequest(input: {
  k: number;
  aspects: SparseAspectInput[];
  accessFilter: string;
  includeNullAccess: boolean;
  withDocs: boolean;
  withVectors: boolean;
  withExplanation: boolean;
}): SearchIndexRequest {
  const query: Record<string, string | number> = {};
  const weights: Record<string, number> = {};

  for (const aspect of input.aspects) {
    const trimmed = aspect.value.trim();
    if (!trimmed) {
      continue;
    }

    const asNumber = Number(trimmed);
    query[aspect.name] = trimmed !== "" && !Number.isNaN(asNumber) &&
        trimmed === String(asNumber)
      ? asNumber
      : trimmed;

    const weight = Number(aspect.weight);
    if (aspect.weight.trim() !== "" && !Number.isNaN(weight)) {
      weights[aspect.name] = weight;
    }
  }

  const request: SearchIndexRequest = {
    k: input.k,
    query,
    withDocs: input.withDocs,
    withVectors: input.withVectors,
    withExplanation: input.withExplanation,
  };

  if (Object.keys(weights).length > 0) {
    request.weights = weights;
  }

  const filter = parseAccessFilter(input.accessFilter, input.includeNullAccess);
  if (filter !== undefined) {
    request.accessFilter = filter;
  }

  return request;
}

/** React Hook Form schema for the index search page. */
export const searchFormSchema = z.object({
  k: z.string().refine(
    (v) => v.trim() !== "" && Number.isInteger(Number(v)) && Number(v) >= 1,
    "k must be a positive integer",
  ),
  aspects: z.array(
    z.object({
      name: z.string(),
      value: z.string(),
      weight: z.string().refine(
        (v) => v.trim() === "" || !Number.isNaN(Number(v)),
        "Weight must be a number",
      ),
    }),
  ),
  accessFilter: z.string(),
  includeNullAccess: z.boolean(),
  withDocs: z.boolean(),
  withExplanation: z.boolean(),
  withVectors: z.boolean(),
});

export type SearchFormValues = z.infer<typeof searchFormSchema>;

/**
 * Parses a comma-separated access filter. Empty input means no filter.
 */
export function parseAccessFilter(
  raw: string,
  includeNull: boolean,
): Array<string | null> | undefined {
  const keys = raw.split(",").map((part) => part.trim()).filter(Boolean);
  if (keys.length === 0 && !includeNull) {
    return undefined;
  }

  const filter: Array<string | null> = [...keys];
  if (includeNull) {
    filter.push(null);
  }
  return filter;
}
