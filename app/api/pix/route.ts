import { NextResponse } from "next/server";
import { ensureEnv } from "@/app/lib";

export async function GET() {
  try {
    ensureEnv();
    return NextResponse.json({ pixCopyPaste: process.env.PIX_COPY_PASTE });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Erro ao obter PIX" },
      { status: 500 }
    );
  }
}
