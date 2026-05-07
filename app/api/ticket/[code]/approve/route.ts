import { NextResponse } from "next/server";
import { addOneDayISO, buildFakePlate, technextRequest } from "@/app/lib";

export async function PUT(request: Request, { params }: { params: { code: string } }) {
  try {
    const body = (await request.json()) as { fullName?: string };

    if (!body.fullName || body.fullName.trim().length < 5) {
      return NextResponse.json({ message: "Informe o nome completo." }, { status: 400 });
    }

    const fakePlate = buildFakePlate(body.fullName);
    const toleranceUntil = addOneDayISO();

    const updated = await technextRequest(`/tickets/${params.code}`, {
      method: "PUT",
      body: JSON.stringify({
        fullName: body.fullName,
        fakePlate,
        toleranceUntil,
        toleranceDays: 1,
        paymentStatus: "pix_confirmed"
      })
    });

    return NextResponse.json({ updated, fakePlate, toleranceUntil });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Erro ao aprovar ticket" },
      { status: 500 }
    );
  }
}
