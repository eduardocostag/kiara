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
// 🧠 MEMÓRIA (REDIS)
// ─────────────────────────────
async function salvarMemoria(pergunta, resposta) {
    const item = {
        pergunta,
        resposta,
        time: Date.now()
    };

    await redis.lpush('kiara_memory', JSON.stringify(item));

    // manter só os últimos 100 registros
    await redis.ltrim('kiara_memory', 0, 99);
}

async function getRelevantMemory() {
    const data = await redis.lrange('kiara_memory', 0, 19);

    return data
        .map(item => {
            const m = JSON.parse(item);
            return `Usuário: ${m.pergunta}\nKIARA: ${m.resposta}`;
        })
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
// 🧠 IA
// ─────────────────────────────
async function getAI(pergunta) {

    const agora = new Date();

    const memoria = await getRelevantMemory();

    const system = `
Você é KIARA, assistente pessoal avançada.

FORMATO JSON:

{
 "texto": "resposta natural",
 "acoes": []
}

REGRAS:
- Nunca usar emojis
- Nunca usar *
- Sempre responder em JSON válido
- Pode retornar múltiplas ações

DATA: ${agora.toLocaleDateString('pt-BR')}
HORA: ${agora.toLocaleTimeString('pt-BR')}

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
            ]
        })
    });

    const raw = await res.text();
    console.log("📡 IA RAW:", raw);

    const json = JSON.parse(raw);

    let content = json.choices?.[0]?.message?.content;

    if (!content) throw new Error("IA vazia");

    content = content.replace(/```json|```/g, '').trim();

    return JSON.parse(content);
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
            texto: "Tive um problema, mas já estou me ajustando.",
            acoes: []
        };
    }
});

// ─────────────────────────────
// 🚀 START
// ─────────────────────────────
fastify.listen({ port: 3000, host: '0.0.0.0' }, () => {
    console.log("🚀 KIARA REDIS ONLINE");
});