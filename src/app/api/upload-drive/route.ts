import { NextRequest, NextResponse } from "next/server";
import { uploadPdfToDrive } from "@/lib/googleDrive";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const filename = (formData.get("filename") as string) || "reporte.pdf";

    if (!file) {
      return NextResponse.json({ error: "No se recibió archivo" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { fileId, viewLink } = await uploadPdfToDrive(buffer, filename);

    return NextResponse.json({ fileId, viewLink });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
