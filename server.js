import express from 'express';
import path from 'path';
import fetch from 'node-fetch';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { Redis } from '@upstash/redis';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

dotenv.config();

// ─────────────────────────────
// CONFIG ES MODULES
// ─────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─────────────────────────────
// EXPRESS
// ─────────────────────────────
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─────────────────────────────
// CONFIG
// ─────────────────────────────
const KEYS = {
    MISTRAL: process.env.MISTRAL_KEY
};

const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN
});

// ─────────────────────────────
// 🧠 MEMÓRIA
// ─────────────────────────────
async function salvarMemoria(pergunta, resposta) {
    await redis.lpush(
        'kiara_memory',
        JSON.stringify({
            pergunta: String(pergunta),
            resposta: String(resposta),
            time: Date.now()
        })
    );

    await redis.ltrim('kiara_memory', 0, 49);
}

function safeParse(item) {
    try {
        return typeof item === "string" ? JSON.parse(item) : item;
    } catch {
        return null;
    }
}

async function getRelevantMemory(pergunta) {
    const data = await redis.lrange('kiara_memory', 0, 50);

    const palavras = pergunta.toLowerCase().split(" ");

    return data
        .map(item => {
            const m = safeParse(item);
            if (!m) return null;

            const texto = `${m.pergunta} ${m.resposta}`.toLowerCase();

            const relevancia = palavras.filter(p => texto.includes(p)).length;

            return { ...m, relevancia };
        })
        .filter(Boolean)
        .sort((a, b) => b.relevancia - a.relevancia)
        .slice(0, 5)
        .map(m => `Usuário: ${m.pergunta}\nKIARA: ${m.resposta}`)
        .join("\n\n");
}

// ─────────────────────────────
// 🧼 LIMPAR TEXTO
// ─────────────────────────────
function limparTexto(texto) {
    return texto
        .replace(/[*_`]/g, '')
        .replace(/[\u{1F600}-\u{1F6FF}]/gu, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// ─────────────────────────────
// 🎙️ TTS (EDGE)
// ─────────────────────────────
async function gerarAudio(texto) {
    try {
        const ELEVENLABS_KEY = process.env.ELEVENLABS_KEY || "0ba797ee7c0ab2e56a5dafe8aa5137ac4561b0c033229323b571427c13cfe9e3";

        console.log("Tentando TTS com ElevenLabs...");

        const response = await fetch('https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM', {
            method: 'POST',
            headers: {
                'Accept': 'audio/mpeg',
                'Content-Type': 'application/json',
                'xi-api-key': ELEVENLABS_KEY
            },
            body: JSON.stringify({
                text: limparTexto(texto),
                model_id: 'eleven_multilingual_v1',
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.5
                }
            })
        });

        console.log("Resposta ElevenLabs:", response.status);

        if (!response.ok) {
            throw new Error(`ElevenLabs error: ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        console.log("Áudio gerado, tamanho:", arrayBuffer.byteLength);
        return Buffer.from(arrayBuffer).toString('base64');

    } catch (err) {
        console.error("Erro TTS:", err);
        return null;
    }
}

// ─────────────────────────────
// 🧠 IA (MISTRAL)
// ─────────────────────────────
async function getAI(pergunta) {

    const memoria = await getRelevantMemory(pergunta);

    const system = `
Você é KIARA, assistente inteligente.

IMPORTANTE:
- Responda APENAS em JSON válido
- Nunca use markdown
- Nunca use emojis
- Nunca use *

FORMATO:

{
 "texto": "resposta natural",
 "acoes": []
}

MEMÓRIA:
${memoria}
`;

    const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${KEYS.MISTRAL}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: "mistral-small-latest",
            messages: [
                { role: "system", content: system },
                { role: "user", content: pergunta }
            ],
            temperature: 0.7
        })
    });

    const raw = await res.text();
    console.log("📡 IA RAW:", raw);

    let json;
    try {
        json = JSON.parse(raw);
    } catch {
        throw new Error("Erro parse Mistral");
    }

    let content = json.choices?.[0]?.message?.content;

    if (!content) throw new Error("IA vazia");

    content = content.replace(/```json|```/g, '').trim();

    try {
        return JSON.parse(content);
    } catch (err) {
        console.error("Erro JSON IA:", content);
        throw new Error("Resposta inválida da IA");
    }
}

// ─────────────────────────────
// 💬 API
// ─────────────────────────────
app.post('/api/chat', async (req, res) => {
    const { pergunta } = req.body;

    try {
        const resposta = await getAI(pergunta);

        await salvarMemoria(pergunta, resposta.texto);

        const audio = await gerarAudio(resposta.texto);

        res.json({
            texto: resposta.texto,
            acoes: resposta.acoes || [],
            audio // base64 (se falhar, será null)
        });

    } catch (err) {
        console.error(err);

        res.json({
            texto: "Erro interno, mas estou aprendendo.",
            acoes: [],
            audio: null
        });
    }
});

// ─────────────────────────────
// 🚀 START
// ─────────────────────────────
if (process.env.NODE_ENV !== 'production') {
    app.listen(3000, '0.0.0.0', () => {
        console.log("🚀 KIARA ONLINE (MISTRAL + MEMÓRIA + VOZ)");
    });
}

export default app;