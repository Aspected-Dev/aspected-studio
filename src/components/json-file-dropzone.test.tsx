import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  assignFileToInput,
  isJsonFile,
  JsonFileDropzone,
} from "./json-file-dropzone.tsx"

afterEach(() => {
  cleanup()
})

/** Builds a drag payload jsdom can deliver to React handlers. */
function fileDataTransfer(files: File[]): DataTransfer {
  return {
    dropEffect: "none",
    effectAllowed: "all",
    files: files as unknown as FileList,
    items: files.map((file) => ({
      kind: "file" as const,
      type: file.type,
      getAsFile: () => file,
    })) as unknown as DataTransferItemList,
    types: ["Files"],
    clearData: () => undefined,
    getData: () => "",
    setData: () => undefined,
    setDragImage: () => undefined,
  } as DataTransfer
}

describe("isJsonFile", () => {
  it("accepts application/json and .json names", () => {
    expect(
      isJsonFile(new File(["{}"], "set.json", { type: "application/json" })),
    )
      .toBe(true)
    expect(isJsonFile(new File(["{}"], "set.JSON", { type: "" }))).toBe(true)
    expect(isJsonFile(new File(["x"], "notes.txt", { type: "text/plain" })))
      .toBe(false)
  })
})

describe("assignFileToInput", () => {
  it("sets the input files list so the chosen name is visible", () => {
    const input = document.createElement("input")
    input.type = "file"
    const file = new File(["{}"], "garden-set.json", {
      type: "application/json",
    })

    assignFileToInput(input, file)

    expect(input.files).toHaveLength(1)
    expect(input.files?.[0]?.name).toBe("garden-set.json")
  })

  it("no-ops when the input is null", () => {
    expect(() =>
      assignFileToInput(
        null,
        new File(["{}"], "set.json", { type: "application/json" }),
      )
    ).not.toThrow()
  })
})

describe("JsonFileDropzone", () => {
  it("shows the overlay while a file is dragged over the surface", () => {
    const onFile = vi.fn()
    render(
      <JsonFileDropzone
        header={<h2>Import</h2>}
        onFile={onFile}
        label="Drop JSON file to import"
      >
        <p>Body</p>
      </JsonFileDropzone>,
    )

    const surface = screen.getByText("Import").parentElement!
    expect(
      screen.queryByText("Drop JSON file to import"),
    ).not.toBeInTheDocument()

    fireEvent.dragEnter(surface, {
      dataTransfer: fileDataTransfer([
        new File(["{}"], "set.json", { type: "application/json" }),
      ]),
    })

    expect(screen.getByText("Drop JSON file to import")).toBeInTheDocument()
    expect(screen.getByText("Release to load it into the editor"))
      .toBeInTheDocument()
    expect(surface).toHaveAttribute("data-active", "true")
  })

  it("keeps the header visible while the overlay covers the body", () => {
    render(
      <JsonFileDropzone header={<h2>Stay visible</h2>} onFile={vi.fn()}>
        <p>Body</p>
      </JsonFileDropzone>,
    )

    const surface = screen.getByText("Stay visible").parentElement!
    fireEvent.dragEnter(surface, {
      dataTransfer: fileDataTransfer([
        new File(["{}"], "set.json", { type: "application/json" }),
      ]),
    })

    expect(screen.getByText("Stay visible")).toBeInTheDocument()
    expect(screen.getByText("Drop JSON file")).toBeInTheDocument()
  })

  it("calls onFile with the first dropped JSON file", () => {
    const onFile = vi.fn()
    const file = new File(['{"ok":true}'], "set.json", {
      type: "application/json",
    })
    render(
      <JsonFileDropzone onFile={onFile}>
        <p>Body</p>
      </JsonFileDropzone>,
    )

    const surface = screen.getByText("Body").closest(
      "[data-slot=json-file-dropzone]",
    )!
    fireEvent.drop(surface, { dataTransfer: fileDataTransfer([file]) })

    expect(onFile).toHaveBeenCalledExactlyOnceWith(file)
    expect(surface).not.toHaveAttribute("data-active")
  })

  it("rejects non-JSON drops via onReject", () => {
    const onFile = vi.fn()
    const onReject = vi.fn()
    const file = new File(["hello"], "notes.txt", { type: "text/plain" })
    render(
      <JsonFileDropzone onFile={onFile} onReject={onReject}>
        <p>Body</p>
      </JsonFileDropzone>,
    )

    const surface = screen.getByText("Body").closest(
      "[data-slot=json-file-dropzone]",
    )!
    fireEvent.drop(surface, { dataTransfer: fileDataTransfer([file]) })

    expect(onFile).not.toHaveBeenCalled()
    expect(onReject).toHaveBeenCalledExactlyOnceWith(file)
  })
})
