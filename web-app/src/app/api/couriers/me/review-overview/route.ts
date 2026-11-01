import { NextRequest } from "next/server";
import {
  accessToken,
  backend,
  errorResponse,
  json,
} from "@/services/backend.server";
import type { CourierReviewOverview } from "@/services/contracts";

export async function GET(request: NextRequest) {
  try {
    return json(
      await backend<CourierReviewOverview>(
        "order",
        "couriers/me/review-overview",
        { token: accessToken(request) },
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
