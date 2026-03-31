const GAS_URL = process.env.GOOGLE_APPS_SCRIPT_URL;

export async function uploadPdfToDrive(
  pdfBuffer: Buffer,
  filename: string,
  folderPath?: string
): Promise<{ viewLink: string }> {
  if (!GAS_URL) throw new Error("GOOGLE_APPS_SCRIPT_URL must be set");

  const fileData = pdfBuffer.toString("base64");

  const res = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileData, fileName: filename, mimeType: "application/pdf", folderPath }),
    redirect: "follow",
  });

  if (!res.ok) throw new Error(`GAS error: ${res.status}`);

  // GAS returns plain text or JSON — handle both
  const text = await res.text();
  let viewLink = text;
  try {
    const json = JSON.parse(text);
    viewLink = json.viewLink ?? json.url ?? text;
  } catch {}

  return { viewLink };
}
