import { demoFeedback } from "@/data/songul-content";
import type { FeedbackResult } from "@/types/songul";

export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
    public code = "REQUEST_FAILED",
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function validateFeedback(value: Partial<FeedbackResult>): FeedbackResult {
  return {
    recognized: String(value.recognized ?? ""),
    correction: String(value.correction ?? value.recognized ?? ""),
    grammar_tip: String(value.grammar_tip ?? ""),
    issues: Array.isArray(value.issues) ? value.issues.map(String) : [],
    chips: Array.isArray(value.chips) ? value.chips.map(String).slice(0, 3) : [],
    recommendation: String(value.recommendation ?? ""),
    score: Math.max(0, Math.min(100, Math.round(Number(value.score) || 0))),
  };
}

export async function checkWriting(image: string): Promise<FeedbackResult> {
  const baseUrl = process.env.EXPO_PUBLIC_SONGUL_API_BASE_URL?.replace(/\/$/, "");
  if (!baseUrl) {
    throw new ApiError("EXPO_PUBLIC_SONGUL_API_BASE_URL is not set.", 0, "MISSING_API_BASE_URL");
  }

  try {
    const response = await fetch(`${baseUrl}/api/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new ApiError(data.error || `Request failed with HTTP ${response.status}.`, response.status);
    }

    return validateFeedback(data);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(error instanceof Error ? error.message : "Network request failed.", 0, "NETWORK_ERROR");
  }
}

export function getOfflineDemoFeedback(): FeedbackResult {
  return demoFeedback;
}

export function describeApiError(error: unknown) {
  if (!(error instanceof ApiError)) {
    return {
      title: "AI check failed",
      detail: error instanceof Error ? error.message : "Unexpected error.",
    };
  }
  if (error.code === "MISSING_API_BASE_URL") {
    return {
      title: "API URL missing",
      detail: "Set EXPO_PUBLIC_SONGUL_API_BASE_URL to the server that hosts /api/check.",
    };
  }
  if (error.status === 401 || error.status === 403) {
    return { title: "Proxy rejected the request", detail: "Check the server-side Gemini key and proxy permissions." };
  }
  if (error.status === 429) {
    return { title: "Quota exceeded", detail: "The AI service is rate-limited. Wait and try again." };
  }
  if (error.status >= 500) {
    return { title: "AI service unavailable", detail: "The proxy or Gemini service returned a server error." };
  }
  return { title: "Network error", detail: error.message };
}
