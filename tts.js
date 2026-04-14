import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

function limparTexto(texto) {
  return String(texto || "")
    .replace(/[*_`]/g, "")
    .replace(/[\u{1F600}-\u{1F6FF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function generateTtsBase64(texto) {
  if (!texto) return null;

  try {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(
      "pt-BR-FranciscaNeural",
      OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3,
    );

    const textoLimpo = limparTexto(texto);
    const { audioStream } = tts.toStream(textoLimpo);

    const chunks = [];
    await new Promise((resolve, reject) => {
      audioStream.on("data", (chunk) => chunks.push(chunk));
      audioStream.on("end", resolve);
      audioStream.on("error", reject);
    });

    const buffer = Buffer.concat(chunks);
    if (!buffer || buffer.length === 0) return null;
    return buffer.toString("base64");
  } catch {
    return null;
  }
}

