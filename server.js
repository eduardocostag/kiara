const fastify = require('fastify')({ logger: true });
const path = require('path');
const fs = require('fs');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
const fetch = require('node-fetch');

// ─────────────────────────────
// 🔐 CONFIG
// ─────────────────────────────
const KEYS = {
    MISTRAL: "3vK0izdqGclG2LOraceEqtyuyJRtZflO"
};

let commandQueue = []; // 🔥 fila de comandos para o PC

// ─────────────────────────────
// 📁 STATIC
// ─────────────────────────────
const publicPath = path.join(__dirname, 'public');
if (!fs.existsSync(publicPath)) fs.mkdirSync(publicPath);

fastify.register(require('@fastify/static'), {
    root: publicPath,
    prefix: '/',
});

// ─────────────────────────────
// 💾 MEMÓRIA PERSISTENTE
// ─────────────────────────────
const DB_FILE = './memory.json';

function loadMemory() {
    if (!fs.existsSync(DB_FILE)) return [];
    return JSON.parse(fs.readFileSync(DB_FILE));
}

function saveMemory(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

let conversationHistory = loadMemory();

// ─────────────────────────────
// 🎙️ TTS
// ─────────────────────────────
async function generateAudio(texto) {
    try {
        const tts = new MsEdgeTTS();
        await tts.setMetadata(
            'pt-BR-FranciscaNeural',
            OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3
        );

        return new Promise((resolve, reject) => {
            const chunks = [];
            const { audioStream } = tts.toStream(texto);

            audioStream.on('data', (c) => chunks.push(c));
            audioStream.on('end', () =>
                resolve(Buffer.concat(chunks).toString('base64'))
            );
            audioStream.on('error', reject);
        });

    } catch {
        return null;
    }
}

// ─────────────────────────────
// 🌐 IA
// ─────────────────────────────
async function getAIResponse(pergunta) {

    const agora = new Date();
    const dataAtual = agora.toLocaleDateString('pt-BR');
    const horaAtual = agora.toLocaleTimeString('pt-BR');

    const systemPrompt = `
Você é a KIARA 3.0, assistente estilo JARVIS.

Data: ${dataAtual}
Hora: ${horaAtual}

Responda SEMPRE em JSON:

{
  "texto": "...",
  "acao": {
    "tipo": "comando | pesquisa | nenhum",
    "dados": {}
  }
}

COMANDOS:
- abrir_vscode
- abrir_navegador
- listar_arquivos
`;

    const messages = [
        { role: "system", content: systemPrompt },
        ...conversationHistory.slice(-10),
        { role: "user", content: pergunta }
    ];

    try {
        const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${KEYS.MISTRAL}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "mistral-small-latest",
                messages
            })
        });

        const raw = await res.text();
        console.log("📡 IA RAW:", raw);

        const parsed = JSON.parse(raw);

        if (!parsed.choices || !parsed.choices[0]) {
            throw new Error("Resposta inválida da IA");
        }

        let content = parsed.choices[0].message.content;

        // 🔥 remove ```json
        content = content.replace(/```json|```/g, '').trim();

        return JSON.parse(content);

    } catch (err) {
        console.error("🔥 Erro IA:", err.message);

        return {
            texto: "Tive um problema ao processar sua solicitação, mas já estou me ajustando.",
            acao: { tipo: "nenhum", dados: {} }
        };
    }
}

// ─────────────────────────────
// 🧠 ACTION ENGINE
// ─────────────────────────────
function processAction(acao) {
    if (!acao || acao.tipo === "nenhum") return;

    if (acao.tipo === "comando") {
        commandQueue.push(acao.dados);
        console.log("📥 Comando enviado pro cliente:", acao.dados);
    }
}

// ─────────────────────────────
// 📡 API CHAT
// ─────────────────────────────
fastify.post('/api/chat', async (req, reply) => {
    const { pergunta } = req.body;

    try {
        const resposta = await getAIResponse(pergunta);

        conversationHistory.push({ role: "user", content: pergunta });
        conversationHistory.push({ role: "assistant", content: resposta.texto });

        saveMemory(conversationHistory);

        processAction(resposta.acao);

        const audio = await generateAudio(resposta.texto);

        return { ...resposta, audio };

    } catch (err) {
        console.error("🔥 ERRO:", err);
        return reply.send({
            texto: "Tive um erro, mas já estou me ajustando.",
            acao: { tipo: "nenhum" }
        });
    }
});

// ─────────────────────────────
// 💻 CLIENT PULL (PC)
// ─────────────────────────────
fastify.get('/api/comandos', async () => {
    const cmds = [...commandQueue];
    commandQueue = [];
    return cmds;
});

// ─────────────────────────────
// 🚀 START
// ─────────────────────────────
fastify.listen({ port: 3000, host: '0.0.0.0' }, () => {
    console.log('🚀 KIARA 3.0 ONLINE');
});