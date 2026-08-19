import type { z } from "zod";
import { type ConnectionSettings, resolveApiBase } from "./connection.ts";
import {
  type CreateIndexRequest,
  createIndexRequestSchema,
  createIndexResponseSchema,
  deleteIndexResponseSchema,
  errorResponseSchema,
  getDocResponseSchema,
  getIndexResponseSchema,
  listDocsResponseSchema,
  listIndexesResponseSchema,
  type SearchIndexRequest,
  searchIndexRequestSchema,
  searchIndexResponseSchema,
  statusResponseSchema,
  type UploadDocsRequest,
  uploadDocsRequestSchema,
  uploadDocsResponseSchema,
} from "./types.ts";

/** HTTP error returned by the Aspected server or a failed parse. */
export class AspectedApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "AspectedApiError";
    this.status = status;
    this.body = body;
  }
}

/** A recorded request, used by the curl inspector. */
export type RecordedRequest = {
  method: string;
  path: string;
  url: string;
  headers: Record<string, string>;
  body?: unknown;
};

type RequestOptions<T> = {
  method?: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  schema: z.ZodType<T>;
};

/**
 * Thin fetch wrapper for the Aspected REST API.
 */
export class AspectedClient {
  readonly connection: ConnectionSettings;
  lastRequest: RecordedRequest | null = null;

  constructor(connection: ConnectionSettings) {
    this.connection = connection;
  }

  /** `GET /status` */
  getStatus() {
    return this.request("/status", { schema: statusResponseSchema });
  }

  /** `GET /indexes` */
  listIndexes(page = 1, limit = 100) {
    return this.request("/indexes", {
      query: { page, limit },
      schema: listIndexesResponseSchema,
    });
  }

  /** `GET /indexes/{name}` */
  getIndex(name: string) {
    return this.request(`/indexes/${encodeURIComponent(name)}`, {
      schema: getIndexResponseSchema,
    });
  }

  /** `PUT /indexes/{name}` */
  createIndex(name: string, body: CreateIndexRequest) {
    return this.request(`/indexes/${encodeURIComponent(name)}`, {
      method: "PUT",
      body: createIndexRequestSchema.parse(body),
      schema: createIndexResponseSchema,
    });
  }

  /** `DELETE /indexes/{name}` */
  deleteIndex(name: string) {
    return this.request(`/indexes/${encodeURIComponent(name)}`, {
      method: "DELETE",
      schema: deleteIndexResponseSchema,
    });
  }

  /** `POST /indexes/{name}/search` */
  searchIndex(name: string, body: SearchIndexRequest) {
    return this.request(`/indexes/${encodeURIComponent(name)}/search`, {
      method: "POST",
      body: searchIndexRequestSchema.parse(body),
      schema: searchIndexResponseSchema,
    });
  }

  /** `GET /indexes/{name}/docs` */
  listDocs(
    name: string,
    options: { page?: number; limit?: number; ids?: string[] } = {},
  ) {
    const ids = options.ids?.filter(Boolean).join(",");
    return this.request(`/indexes/${encodeURIComponent(name)}/docs`, {
      query: {
        page: options.page ?? 1,
        limit: options.limit ?? 10,
        ids,
      },
      schema: listDocsResponseSchema,
    });
  }

  /** `GET /indexes/{name}/docs/{id}` */
  getDoc(name: string, id: string) {
    return this.request(
      `/indexes/${encodeURIComponent(name)}/docs/${encodeURIComponent(id)}`,
      { schema: getDocResponseSchema },
    );
  }

  /** `POST /indexes/{name}/docs` */
  uploadDocs(name: string, body: UploadDocsRequest) {
    return this.request(`/indexes/${encodeURIComponent(name)}/docs`, {
      method: "POST",
      body: uploadDocsRequestSchema.parse(body),
      schema: uploadDocsResponseSchema,
    });
  }

  private async request<T>(
    path: string,
    options: RequestOptions<T>,
  ): Promise<T> {
    const method = options.method ?? "GET";
    const url = this.buildUrl(path, options.query);
    const headers: Record<string, string> = {};

    if (this.connection.apiToken) {
      headers.Authorization = `Bearer ${this.connection.apiToken}`;
    }

    const init: RequestInit = { method, headers };
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(options.body);
    }

    this.lastRequest = {
      method,
      path,
      url,
      headers: { ...headers },
      body: options.body,
    };

    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (caught) {
      const message = caught instanceof Error
        ? caught.message
        : "Failed to fetch";
      throw new AspectedApiError(message, 0, caught);
    }

    const text = await response.text();
    const json = text ? parseJson(text) : null;

    if (!response.ok) {
      const parsed = errorResponseSchema.safeParse(json);
      const message = parsed.success && parsed.data.error
        ? parsed.data.error
        : `The server returned HTTP ${response.status} with no error message.`;
      throw new AspectedApiError(message, response.status, json);
    }

    const parsed = options.schema.safeParse(json);
    if (!parsed.success) {
      throw new AspectedApiError(
        "The server response did not match the expected format.",
        response.status,
        json,
      );
    }

    return parsed.data;
  }

  private buildUrl(
    path: string,
    query?: Record<string, string | number | undefined>,
  ): string {
    const origin = resolveApiBase(this.connection.baseUrl);
    const url = new URL(`${origin}${path}`, window.location.origin);

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== "") {
          url.searchParams.set(key, String(value));
        }
      }
    }

    if (origin.startsWith("/")) {
      return `${url.pathname}${url.search}`;
    }

    return url.toString();
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
