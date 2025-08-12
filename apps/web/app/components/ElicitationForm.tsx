"use client";

import { useCallback, useMemo, useState } from "react";

// Simplified types for our specific use case
type Field = {
  name: string;
  label: string;
  type: "text" | "email" | "textarea" | "file";
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  errors?: string[];
};

type Elicitation = {
  title: string;
  description?: string;
  fields: Field[];
};

type ElicitationSubmission = {
  name?: string;
  email?: string;
  bio?: string;
  avatar?: string;
};

type Props = {
  elicitation: Elicitation;
  onSubmit: (values: ElicitationSubmission) => Promise<void> | void;
};

export default function ElicitationForm({ elicitation, onSubmit }: Props) {
  const [values, setValues] = useState<ElicitationSubmission>({});
  const [submitting, setSubmitting] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // Handle text input changes
  const handleChange = useCallback(
    (name: string, value: string) => {
      setValues((prev) => ({ ...prev, [name]: value }));
    },
    []
  );

  // Handle file input changes
  const handleFile = useCallback(
    async (name: string, file: File | null) => {
      if (!file) {
        handleChange(name, "");
        return;
      }
      
      // Read file as data URL
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        handleChange(name, dataUrl);
      };
      reader.readAsDataURL(file);
    },
    [handleChange]
  );

  // Handle form submission
  const handleSubmit = useCallback(
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

  // Preview avatar if provided as data URL
  const avatarPreview = useMemo(() => {
    const v = values.avatar;
    if (typeof v === "string" && v.startsWith("data:")) return v;
    return null;
  }, [values.avatar]);

  return (
    <form
      onSubmit={handleSubmit}
  className="space-y-6 rounded-xl border border-gray-200 bg-white/80 p-6 shadow-sm backdrop-blur-sm ring-1 ring-gray-100"
    >
      <div className="space-y-1">
        <h3 className="m-0 text-xl font-semibold tracking-tight text-gray-900">
          {elicitation.title}
        </h3>
        {elicitation.description && (
          <p className="text-sm leading-6 text-gray-600">{elicitation.description}</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
      {elicitation.fields.map((field) => {
        const { name, label, type, required, errors } = field;
        const hasError = !!(errors && errors.length);
        
        // Common label component
        const fieldLabel = (
          <label className="block text-sm font-medium text-gray-800">
            {label} {required ? "*" : ""}
          </label>
        );
        
        // Display errors if any
        const errorDisplay = hasError ? (
          <div className="text-xs text-red-600">{errors!.join(", ")}</div>
        ) : null;
        
        switch (type) {
          case "text":
          case "email":
            return (
              <div key={name} className="grid gap-1.5 sm:col-span-1">
                {fieldLabel}
                <input
                  className={[
                    "rounded-md border px-3 py-2 outline-none transition-shadow",
                    hasError
                      ? "border-red-300 ring-2 ring-red-200 focus:ring-red-300"
                      : "border-gray-300 focus:ring-2 focus:ring-blue-600",
                  ].join(" ")}
                  type={type}
                  name={name}
                  required={required}
                  minLength={field.minLength}
                  maxLength={field.maxLength}
                  aria-invalid={hasError}
                  onChange={(e) => handleChange(name, e.target.value)}
                  value={values[name as keyof ElicitationSubmission] as string || ""}
                />
                {errorDisplay}
              </div>
            );
          case "textarea":
            return (
              <div key={name} className="grid gap-1.5 sm:col-span-2">
                {fieldLabel}
                <textarea
                  className={[
                    "min-h-[120px] rounded-md border px-3 py-2 outline-none transition-shadow",
                    hasError
                      ? "border-red-300 ring-2 ring-red-200 focus:ring-red-300"
                      : "border-gray-300 focus:ring-2 focus:ring-blue-600",
                  ].join(" ")}
                  name={name}
                  required={required}
                  minLength={field.minLength}
                  maxLength={field.maxLength}
                  aria-invalid={hasError}
                  onChange={(e) => handleChange(name, e.target.value)}
                  value={values[name as keyof ElicitationSubmission] as string || ""}
                />
                {errorDisplay}
              </div>
            );
          case "file":
            return (
              <div key={name} className="grid gap-2 sm:col-span-2">
                {fieldLabel}
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragActive(false);
                    const f = e.dataTransfer.files?.[0] ?? null;
                    void handleFile(name, f);
                  }}
                  className={[
                    "flex items-center justify-between gap-3 rounded-lg border bg-gray-50 px-3 py-3 transition",
                    dragActive ? "border-blue-400 ring-2 ring-blue-200" : hasError ? "border-red-300" : "border-gray-300 hover:bg-gray-100",
                  ].join(" ")}
                >
                  <div className="text-sm text-gray-700">
                    <span className="font-medium text-gray-900">Click to upload</span> or drag and drop
                    <div className="text-xs text-gray-500">PNG or JPG, up to ~1MB</div>
                  </div>
                  <label className="inline-flex cursor-pointer items-center rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 focus-within:outline-none focus-within:ring-2 focus-within:ring-blue-600">
                    Browse
                    <input
                      type="file"
                      name={name}
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => handleFile(name, e.target.files?.[0] ?? null)}
                    />
                  </label>
                </div>
                {avatarPreview && (
                  <div className="mt-2 flex items-center gap-3">
                    <img
                      src={avatarPreview}
                      alt="Avatar preview"
                      className="h-16 w-16 rounded-md object-cover ring-1 ring-gray-200"
                    />
                    <div className="text-xs text-gray-600">Preview of your selected image</div>
                  </div>
                )}
                {errorDisplay}
              </div>
            );
          default:
            return null;
        }
      })}
      </div>

      <div>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-white shadow-sm hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting && (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
            </svg>
          )}
          <span>{submitting ? "Submitting..." : "Submit"}</span>
        </button>
      </div>
    </form>
  );
}