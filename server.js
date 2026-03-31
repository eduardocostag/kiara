const fastify = require('fastify')({ logger: true });
const path = require('path');
const fetch = require('node-fetch');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
const { Redis } = require('@upstash/redis');
require('dotenv').config();

// ─────────────────────────────
// 🔐 CONFIG
// ─────────────────────────────
const KEYS = {
    MISTRAL: process.env.MISTRAL_KEY || "SUA_CHAVE_AQUI"
};

const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN
});

// ─────────────────────────────
// 🧠 MEMÓRIA
// ─────────────────────────────

// salvar memória
async function salvarMemoria(pergunta, resposta) {
    await redis.lpush(
        'kiara_memory',
        JSON.stringify({
            pergunta,
            resposta,
            time: Date.now()
        })
    );
}

// parse seguro
function safeParse(item) {
    if (!item) return null;

    try {
        return typeof item === "string" ? JSON.parse(item) : item;
    } catch {
        return null;
    }
}

// buscar memória relevante (INTELIGENTE)
async function getRelevantMemory(pergunta) {
    const data = await redis.lrange('kiara_memory', 0, 100);

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
// 📁 STATIC
// ─────────────────────────────
fastify.register(require('@fastify/static'), {
    root: path.join(__dirname, 'public'),
    prefix: '/'
});

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
// 🎙️ TTS
// ─────────────────────────────
async function gerarAudio(texto) {
    try {
        const tts = new MsEdgeTTS();

        await tts.setMetadata(
            'pt-BR-FranciscaNeural',
            OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3
        );

        const textoLimpo = limparTexto(texto);

        return new Promise((resolve, reject) => {
            const chunks = [];
            const { audioStream } = tts.toStream(textoLimpo);

            audioStream.on('data', c => chunks.push(c));
            audioStream.on('end', () => {
                resolve(Buffer.concat(chunks).toString('base64'));
            });
            audioStream.on('error', reject);
        });

    } catch (err) {
        console.log("Erro TTS:", err);
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
- Não use markdown
- Não use emojis
- Não use *

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
        throw new Error("Erro ao parsear resposta da IA");
    }

    let content = json.choices?.[0]?.message?.content;

    if (!content) throw new Error("IA vazia");

    content = content.replace(/```json|```/g, '').trim();

    let parsed;

    try {
        parsed = JSON.parse(content);
    } catch {
        console.error("Erro JSON:", content);
        throw new Error("JSON inválido da IA");
    }

    return parsed;
}

// ─────────────────────────────
// 💬 API
// ─────────────────────────────
fastify.post('/api/chat', async (req, reply) => {

    const { pergunta } = req.body;

    try {
        const resposta = await getAI(pergunta);

        await salvarMemoria(pergunta, resposta.texto);

        const audio = await gerarAudio(resposta.texto);

        return {
            texto: resposta.texto,
            acoes: resposta.acoes || [],
            audio
        };

    } catch (err) {
        console.error(err);

        return {
            texto: "Erro interno, mas estou aprendendo.",
            acoes: []
        };
    }
});

// ─────────────────────────────
// 🚀 START
// ─────────────────────────────
fastify.listen({ port: 3000, host: '0.0.0.0' }, () => {
    console.log("🚀 KIARA ONLINE COM MISTRAL + MEMÓRIA");
});