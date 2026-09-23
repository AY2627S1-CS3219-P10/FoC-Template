import { NextRequest } from "next/server";
import {
  accessToken,
  backend,
  errorResponse,
  json,
} from "@/services/backend.server";
import type { Supplier } from "@/services/contracts";

export async function GET(request: NextRequest) {
  try {
    return json(
      await backend<Supplier[]>("supplier", "suppliers", {
        token: accessToken(request),
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
