import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "No file uploaded" }, { status: 400 });
    }

    const name = file.name.toLowerCase();
    const buf = Buffer.from(await file.arrayBuffer());
    let text = "";

    if (name.endsWith(".docx")) {
      const result = await mammoth.extractRawText({ buffer: buf });
      text = result.value;
    } else if (name.endsWith(".pdf")) {
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const result = await extractText(pdf, { mergePages: true });
      text = Array.isArray(result.text) ? result.text.join("\n") : result.text;
    } else if (name.endsWith(".txt") || name.endsWith(".md")) {
      text = buf.toString("utf-8");
    } else {
      return Response.json(
        { error: "Unsupported file type. Use PDF, DOCX, TXT, or paste the text." },
        { status: 400 },
      );
    }

    return Response.json({ text: text.trim() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: `Could not read file: ${message}. Try pasting the text instead.` },
      { status: 500 },
    );
  }
}
