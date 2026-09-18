import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePartner } from "@/lib/auth/session";
import {
  AgedCheckoutError,
  createAgedCheckoutSession,
} from "@/lib/aged/create-aged-checkout";

const purchaseSchema = z.object({
  leadIds: z.array(z.string().uuid()).min(1).max(50),
});

export async function POST(request: NextRequest) {
  const authResult = await requirePartner();
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: 403 });
  }

  const body = await request.json();
  const parsed = purchaseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    const result = await createAgedCheckoutSession({
      partnerId: authResult.partner.id,
      partnerEmail: authResult.partner.email,
      leadIds: parsed.data.leadIds,
      originHeader: request.nextUrl.origin,
    });
    return NextResponse.json({ url: result.url, checkoutId: result.checkoutId });
  } catch (error) {
    if (error instanceof AgedCheckoutError) {
      const status =
        error.code === "stripe"
          ? 503
          : error.code === "inactive"
            ? 403
            : error.code === "unavailable"
              ? 409
              : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    throw error;
  }
}
