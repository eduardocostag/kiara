const fastify = require('fastify')({ logger: true });
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

// ─────────────────────────────
// 🔐 CONFIG
// ─────────────────────────────
const KEYS = {
    MISTRAL: "3vK0izdqGclG2LOraceEqtyuyJRtZflO"
};

const MEMORY_FILE = './memory.json';

// ─────────────────────────────
// 🧠 MEMÓRIA
// ─────────────────────────────
let memory = [];

if (fs.existsSync(MEMORY_FILE)) {
    memory = JSON.parse(fs.readFileSync(MEMORY_FILE));
}

function salvarMemoria() {
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2));
}

function getRelevantMemory() {
    return memory
        .slice(-20)
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
// 🧠 IA (COM MULTI-AÇÕES)
// ─────────────────────────────
async function getAI(pergunta) {

    const agora = new Date();

    const system = `
Você é KIARA, assistente pessoal avançada.

Você pode:
- executar múltiplas ações
- navegar como humano
- lembrar contexto

FORMATO JSON:

{
 "texto": "resposta natural",
 "acoes": [
   { "tipo": "abrir_site", "dados": {} }
 ]
}

AÇÕES DISPONÍVEIS:

abrir_site → { "tipo": "abrir_site", "dados": { "url": "" } }

youtube_busca → { "tipo": "youtube_busca", "dados": { "query": "" } }

pesquisa → { "tipo": "pesquisa", "dados": { "query": "" } }

REGRAS:
- Nunca usar emojis
- Nunca usar *
- Sempre responder em JSON válido
- Pode retornar múltiplas ações

EXEMPLO:

Usuário: abre youtube e toca lo-fi

Resposta:
{
 "texto": "Abrindo YouTube e buscando lo-fi",
 "acoes": [
   { "tipo": "abrir_site", "dados": { "url": "https://youtube.com" }},
   { "tipo": "youtube_busca", "dados": { "query": "lofi hip hop" }}
 ]
}

DATA: ${agora.toLocaleDateString('pt-BR')}
HORA: ${agora.toLocaleTimeString('pt-BR')}

MEMÓRIA:
${getRelevantMemory()}
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

        memory.push({
            pergunta,
            resposta: resposta.texto,
            time: Date.now()
        });

        salvarMemoria();

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
    console.log("🚀 KIARA 6.5 FULL AUTOMATION ONLINE");
});