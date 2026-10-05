/** Client-safe form state shared by server actions and client forms (no server imports here). */
export interface FormState {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  /** Optional payload for the client (e.g. an invite link). */
  data?: Record<string, string>;
}

export const idle: FormState = { status: "idle" };
