// Client-side copy of elicitation types

export type ElicitationFieldBase = {
  id: string;
  label: string;
  required?: boolean;
  helpText?: string;
};

export type TextField = ElicitationFieldBase & {
  type: "text";
  placeholder?: string;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  error?: string;
};

export type TextAreaField = ElicitationFieldBase & {
  type: "textarea";
  placeholder?: string;
  minLength?: number;
  maxLength?: number;
  error?: string;
};

export type NumberField = ElicitationFieldBase & {
  type: "number";
  min?: number;
  max?: number;
  step?: number;
  error?: string;
};

export type SelectField = ElicitationFieldBase & {
  type: "select";
  options: Array<{ value: string; label: string }>;
  error?: string;
};

export type MultiSelectField = ElicitationFieldBase & {
  type: "multiselect";
  options: Array<{ value: string; label: string }>;
  error?: string;
};

export type CheckboxField = ElicitationFieldBase & {
  type: "checkbox";
  error?: string;
};

export type DateField = ElicitationFieldBase & {
  type: "date";
  min?: string;
  max?: string;
  error?: string;
};

export type FileField = ElicitationFieldBase & {
  type: "file";
  accept?: string;
  maxBytes?: number;
  error?: string;
};

export type ElicitationField =
  | TextField
  | TextAreaField
  | NumberField
  | SelectField
  | MultiSelectField
  | CheckboxField
  | DateField
  | FileField;

export type Elicitation = {
  id: string;
  title: string;
  description?: string;
  submitLabel?: string;
  fields: ElicitationField[];
};

export type FileUploadValue = {
  filename: string;
  mimeType: string;
  dataBase64: string;
};

export type ElicitationSubmission = Record<
  string,
  string | number | boolean | string[] | FileUploadValue | null
>;

export type ElicitationResponse =
  | {
      kind: "requiresAction";
      elicitation: Elicitation;
    }
  | {
      kind: "success";
      message: string;
      received: ElicitationSubmission;
      thumbnailDataUrl?: string;
      persistedFile?: { id: string; path: string; filename: string } | null;
    }
  | {
      kind: "validationError";
      elicitation: Elicitation;
    };