import { google } from "googleapis";
import { Readable } from "stream";

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!email || !key) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY must be set");
  }

  return new google.auth.GoogleAuth({
    credentials: { client_email: email, private_key: key },
    scopes: ["https://www.googleapis.com/auth/drive.file"],
  });
}

export async function uploadPdfToDrive(
  pdfBuffer: Buffer,
  filename: string
): Promise<{ fileId: string; viewLink: string }> {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) throw new Error("GOOGLE_DRIVE_FOLDER_ID must be set");

  const auth = getAuth();
  const drive = google.drive({ version: "v3", auth });

  const stream = Readable.from(pdfBuffer);

  const res = await drive.files.create({
    requestBody: {
      name: filename,
      mimeType: "application/pdf",
      parents: [folderId],
    },
    media: { mimeType: "application/pdf", body: stream },
    fields: "id, webViewLink",
  });

  const fileId = res.data.id!;
  const viewLink = res.data.webViewLink!;

  // Make it readable by anyone with the link
  await drive.permissions.create({
    fileId,
    requestBody: { role: "reader", type: "anyone" },
  });

  return { fileId, viewLink };
}
