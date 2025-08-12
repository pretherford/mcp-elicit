// Simple shared types for the elicitation demo

// Input types for the collect_profile tool
export interface ElicitationSubmission {
  name?: string;
  email?: string;
  bio?: string;
  avatar?: string; // Base64 data URL
}

// Field definition for the elicitation form
export interface ElicitationField {
  name: string;
  label: string;
  type: "text" | "email" | "textarea" | "file";
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  errors?: string[];
}

// Form definition returned by the collect_profile tool
export interface Elicitation {
  title: string;
  description?: string;
  fields: ElicitationField[];
}

// Response types from the collect_profile tool
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
      persistedFile?: { path: string; size: number };
    }
  | {
      kind: "validationError";
      message?: string;
      elicitation: Elicitation;
    };