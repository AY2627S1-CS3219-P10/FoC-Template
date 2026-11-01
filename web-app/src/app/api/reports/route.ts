import { NextRequest } from "next/server";
import {
  accessToken,
  backend,
  BackendError,
  errorResponse,
  json,
  readFields,
  requireSameOrigin,
} from "@/services/backend.server";
import type { UserReport } from "@/services/contracts";

export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const token = accessToken(request);
    const body = await readFields(request, ["reportedUserId", "description"]);
    const description = body.description.trim();
    if (!description || description.length > 500)
      throw new BackendError(
        400,
        "Description must contain 1 to 500 characters.",
        "INVALID_REPORT_DESCRIPTION",
      );
    const report = await backend<UserReport>("user", "reports", {
      method: "POST",
      token,
      body: { reportedUserId: body.reportedUserId, description },
    });
    return json(report, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
