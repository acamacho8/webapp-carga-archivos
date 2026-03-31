import { NextRequest, NextResponse } from "next/server";
import { uploadPdfToDrive } from "@/lib/googleDrive";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const filename = (formData.get("filename") as string) || "reporte.pdf";
    const folderPath = (formData.get("folderPath") as string) || undefined;

    if (!file) {
      return NextResponse.json({ error: "No se recibió archivo" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { viewLink } = await uploadPdfToDrive(buffer, filename, folderPath);

    return NextResponse.json({ viewLink });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
