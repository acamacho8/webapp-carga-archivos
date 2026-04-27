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

  const text = await res.text();

  if (!res.ok) throw new Error(`GAS error ${res.status}: ${text.slice(0, 200)}`);

  // GAS returns plain text URL or JSON — handle both
  let viewLink: string = text.trim();
  try {
    const json = JSON.parse(text);
    // Surface GAS-level errors returned with status 200
    if (json.error) throw new Error(`GAS: ${json.error}`);
    viewLink = json.viewLink ?? json.url ?? json.link ?? text.trim();
  } catch (e) {
    if (e instanceof SyntaxError) {
      // Not JSON — use raw text as URL
    } else {
      throw e;
    }
  }

  if (!viewLink.startsWith("https://")) {
    throw new Error(`GAS devolvió respuesta inesperada: ${viewLink.slice(0, 200)}`);
  }

  return { viewLink };
}
