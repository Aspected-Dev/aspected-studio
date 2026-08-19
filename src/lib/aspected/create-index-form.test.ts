import { describe, expect, it } from "vitest";
import {
  createIndexFormSchema,
  draftToCreateRequest,
  emptyAspectDraft,
  emptyCreateIndexDraft,
} from "./create-index-form.ts";

describe("draftToCreateRequest", () => {
  it("maps enum aspects and omits default Cosine", () => {
    const draft = emptyCreateIndexDraft();
    const request = draftToCreateRequest(draft);
    expect(request.distanceType).toBeUndefined();
    expect(request.schema[0]).toMatchObject({
      name: "category",
      type: "enum",
      path: "$.category",
    });
    expect(request.hnsw).toBeUndefined();
  });
});

describe("createIndexFormSchema", () => {
  function validBase() {
    return emptyCreateIndexDraft();
  }

  it("passes for a valid default draft", () => {
    const result = createIndexFormSchema.safeParse(validBase());
    expect(result.success).toBe(true);
  });

  it("fails when name is empty", () => {
    const result = createIndexFormSchema.safeParse({
      ...validBase(),
      name: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const names = result.error.issues.map((i) => i.path.join("."));
      expect(names).toContain("name");
    }
  });

  it("fails when name contains invalid characters", () => {
    const result = createIndexFormSchema.safeParse({
      ...validBase(),
      name: "my index!",
    });
    expect(result.success).toBe(false);
  });

  it("fails when idSize is zero", () => {
    const result = createIndexFormSchema.safeParse({
      ...validBase(),
      idSize: "0",
    });
    expect(result.success).toBe(false);
  });

  it("fails when there are no aspects", () => {
    const result = createIndexFormSchema.safeParse({
      ...validBase(),
      aspects: [],
    });
    expect(result.success).toBe(false);
  });

  it("fails when an enum aspect has no values", () => {
    const draft = validBase();
    draft.aspects[0].enumValues = "";
    const result = createIndexFormSchema.safeParse(draft);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths.some((p) => p.includes("enumValues"))).toBe(true);
    }
  });

  it("fails when an aspect name is missing", () => {
    const draft = validBase();
    draft.aspects[0].name = "";
    const result = createIndexFormSchema.safeParse(draft);
    expect(result.success).toBe(false);
  });

  it("fails when an aspect path does not start with $.", () => {
    const draft = validBase();
    draft.aspects[0].path = "category";
    const result = createIndexFormSchema.safeParse(draft);
    expect(result.success).toBe(false);
  });

  it("fails when a number aspect max is not greater than min", () => {
    const draft = validBase();
    const aspect = emptyAspectDraft();
    aspect.type = "number";
    aspect.name = "price";
    aspect.path = "$.price";
    aspect.min = "10";
    aspect.max = "5";
    draft.aspects = [aspect];
    const result = createIndexFormSchema.safeParse(draft);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => /max must be greater than min/i.test(m)))
        .toBe(
          true,
        );
    }
  });

  it("fails when a text aspect has no model", () => {
    const draft = validBase();
    const aspect = emptyAspectDraft();
    aspect.type = "text";
    aspect.name = "description";
    aspect.path = "$.description";
    aspect.model = "";
    draft.aspects = [aspect];
    const result = createIndexFormSchema.safeParse(draft);
    expect(result.success).toBe(false);
  });

  it("fails when a raw aspect numDims is not a positive integer", () => {
    const draft = validBase();
    const aspect = emptyAspectDraft();
    aspect.type = "raw";
    aspect.name = "embedding";
    aspect.path = "$.embedding";
    aspect.numDims = "0";
    draft.aspects = [aspect];
    const result = createIndexFormSchema.safeParse(draft);
    expect(result.success).toBe(false);
  });

  it("fails when a datetime aspect has no granularities selected", () => {
    const draft = validBase();
    const aspect = emptyAspectDraft();
    aspect.type = "datetime";
    aspect.name = "created";
    aspect.path = "$.created";
    aspect.granularities = [];
    draft.aspects = [aspect];
    const result = createIndexFormSchema.safeParse(draft);
    expect(result.success).toBe(false);
  });
});
