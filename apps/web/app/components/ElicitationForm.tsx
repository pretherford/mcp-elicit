"use client";

import { useCallback, useState } from "react";
import type {
  Elicitation,
  ElicitationSubmission,
  FileUploadValue
} from "../../shared/types";

type Props = {
  elicitation: Elicitation;
  onSubmit: (values: ElicitationSubmission) => Promise<void> | void;
};

export default function ElicitationForm({ elicitation, onSubmit }: Props) {
  const [values, setValues] = useState<ElicitationSubmission>({});
  const [submitting, setSubmitting] = useState(false);

  const handleChange = useCallback(
    (id: string, value: string | number | boolean | string[] | FileUploadValue | null) => {
      setValues((v) => ({ ...v, [id]: value }));
    },
    []
  );

  const handleFile = useCallback(
    async (id: string, file: File | null) => {
      if (!file) {
        handleChange(id, null);
        return;
      }
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const dataBase64 = btoa(String.fromCharCode.apply(null, Array.from(uint8Array)));
      const value: FileUploadValue = {
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        dataBase64
      };
      handleChange(id, value);
    },
    [handleChange]
  );

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      try {
        setSubmitting(true);
        await onSubmit(values);
      } finally {
        setSubmitting(false);
      }
    },
    [values, onSubmit]
  );

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
      <div>
        <h3 className="m-0 text-lg font-semibold">{elicitation.title}</h3>
        {elicitation.description && (
          <p className="mt-1 text-gray-600">{elicitation.description}</p>
        )}
      </div>

      {elicitation.fields.map((f) => {
        const key = f.id;

        const label = (
          <label className="block text-sm font-medium text-gray-800">
            {f.label} {f.required ? "*" : ""}
          </label>
        );

        const help = f.helpText ? <small className="text-gray-500">{f.helpText}</small> : null;
        const error =
          "error" in f && (f as any).error ? (
            <div className="text-sm text-red-700">{(f as any).error}</div>
          ) : null;

        switch (f.type) {
          case "text":
            return (
              <div key={key} className="grid gap-1.5">
                {label}
                <input
                  className="rounded-md border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                  type="text"
                  placeholder={f.placeholder}
                  required={!!f.required}
                  onChange={(e) => handleChange(key, e.target.value)}
                />
                {help}
                {error}
              </div>
            );
          case "textarea":
            return (
              <div key={key} className="grid gap-1.5">
                {label}
                <textarea
                  className="min-h-[100px] rounded-md border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={f.placeholder}
                  required={!!f.required}
                  onChange={(e) => handleChange(key, e.target.value)}
                />
                {help}
                {error}
              </div>
            );
          case "number":
            return (
              <div key={key} className="grid gap-1.5">
                {label}
                <input
                  className="rounded-md border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                  type="number"
                  required={!!f.required}
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  onChange={(e) => handleChange(key, e.target.value === "" ? null : Number(e.target.value))}
                />
                {help}
                {error}
              </div>
            );
          case "select":
            return (
              <div key={key} className="grid gap-1.5">
                {label}
                <select
                  className="rounded-md border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                  required={!!f.required}
                  onChange={(e) => handleChange(key, e.target.value)}
                  defaultValue=""
                >
                  <option value="" disabled>
                    Select…
                  </option>
                  {f.options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {help}
                {error}
              </div>
            );
          case "multiselect":
            return (
              <div key={key} className="grid gap-1.5">
                {label}
                <select
                  multiple
                  className="rounded-md border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                  onChange={(e) => {
                    const selected: string[] = Array.from(e.target.selectedOptions).map((o) => o.value);
                    handleChange(key, selected);
                  }}
                >
                  {f.options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {help}
                {error}
              </div>
            );
          case "checkbox":
            return (
              <div key={key} className="flex items-center gap-2">
                <input
                  id={key}
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  onChange={(e) => handleChange(key, e.target.checked)}
                />
                <label htmlFor={key} className="text-sm text-gray-800">
                  {f.label}
                </label>
                {help}
                {error}
              </div>
            );
          case "date":
            return (
              <div key={key} className="grid gap-1.5">
                {label}
                <input
                  type="date"
                  className="rounded-md border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                  min={f.min}
                  max={f.max}
                  required={!!f.required}
                  onChange={(e) => handleChange(key, e.target.value)}
                />
                {help}
                {error}
              </div>
            );
          case "file":
            return (
              <div key={key} className="grid gap-1.5">
                {label}
                <input
                  type="file"
                  accept={f.accept}
                  className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-gray-900 file:px-3 file:py-1.5 file:text-white hover:file:bg-gray-800"
                  onChange={(e) => handleFile(key, e.target.files?.[0] ?? null)}
                />
                {help}
                {error}
              </div>
            );
          default:
            return null;
        }
      })}

      <div>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {elicitation.submitLabel ?? "Submit"}
        </button>
      </div>
    </form>
  );
}