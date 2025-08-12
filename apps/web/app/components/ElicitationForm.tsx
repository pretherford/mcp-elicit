"use client";

import { useCallback, useState } from "react";

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

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
      <div>
        <h3 className="m-0 text-lg font-semibold">{elicitation.title}</h3>
        {elicitation.description && (
          <p className="mt-1 text-gray-600">{elicitation.description}</p>
        )}
      </div>

      {elicitation.fields.map((field) => {
        const { name, label, type, required, errors } = field;
        
        // Common label component
        const fieldLabel = (
          <label className="block text-sm font-medium text-gray-800">
            {label} {required ? "*" : ""}
          </label>
        );
        
        // Display errors if any
        const errorDisplay = errors && errors.length > 0 ? (
          <div className="text-sm text-red-700">{errors.join(", ")}</div>
        ) : null;
        
        switch (type) {
          case "text":
          case "email":
            return (
              <div key={name} className="grid gap-1.5">
                {fieldLabel}
                <input
                  className="rounded-md border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                  type={type}
                  name={name}
                  required={required}
                  minLength={field.minLength}
                  maxLength={field.maxLength}
                  onChange={(e) => handleChange(name, e.target.value)}
                  value={values[name as keyof ElicitationSubmission] as string || ""}
                />
                {errorDisplay}
              </div>
            );
          case "textarea":
            return (
              <div key={name} className="grid gap-1.5">
                {fieldLabel}
                <textarea
                  className="min-h-[100px] rounded-md border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                  name={name}
                  required={required}
                  minLength={field.minLength}
                  maxLength={field.maxLength}
                  onChange={(e) => handleChange(name, e.target.value)}
                  value={values[name as keyof ElicitationSubmission] as string || ""}
                />
                {errorDisplay}
              </div>
            );
          case "file":
            return (
              <div key={name} className="grid gap-1.5">
                {fieldLabel}
                <input
                  type="file"
                  name={name}
                  accept="image/*"
                  className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-gray-900 file:px-3 file:py-1.5 file:text-white hover:file:bg-gray-800"
                  onChange={(e) => handleFile(name, e.target.files?.[0] ?? null)}
                />
                {errorDisplay}
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
          {submitting ? "Submitting..." : "Submit"}
        </button>
      </div>
    </form>
  );
}