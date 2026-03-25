const fastify = require('fastify')({ logger: false });
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

// Adiciona no topo do server.js
const conversationHistory = []; // memória em RAM (simples)
// Para persistir, use: const Database = require('better-sqlite3')

fastify.post('/api/chat', async (request, reply) => {
    const { pergunta } = request.body;

    // Adiciona pergunta ao histórico
    conversationHistory.push({ role: "user", content: pergunta });

    // Mantém só as últimas 20 mensagens (evita estouro de tokens)
    if (conversationHistory.length > 20) conversationHistory.splice(0, 2);

    // Passa o histórico completo para a IA
    messages: [
        { role: "system", content: systemPrompt },
        ...conversationHistory  // 👈 contexto completo
    ]

    // Salva resposta da IA no histórico
    conversationHistory.push({ role: "assistant", content: kiaraData.texto });
});

const { exec } = require('child_process');

// Mapa de comandos permitidos (segurança!)
const COMANDOS = {
    "abrir navegador": "start chrome",
    "abrir vscode": "code .",
    "listar arquivos": "ls -la",
    "uso de memória": "free -h",
};

// A IA retorna um campo "comando" no JSON
// {"texto": "Abrindo o navegador!", "mood": "active", "comando": "abrir navegador"}

if (kiaraData.comando && COMANDOS[kiaraData.comando]) {
    exec(COMANDOS[kiaraData.comando]);
}
```


const publicPath = path.join(__dirname, 'public');
if (!fs.existsSync(publicPath)) fs.mkdirSync(publicPath);

fastify.register(require('@fastify/static'), {
    root: publicPath,
    prefix: '/',
    setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    }
});

const KEYS = {
    SAMBANOVA: "ef5e56fa-f045-4d63-ab49-8de68a672da6",
    MISTRAL: "mhIHAYZopQKhjgMhfQhHkBTkW2BtnBQ6"
};

// Função para gerar áudio com Edge TTS e retornar Base64
async function generateAudio(texto) {
    const tts = new MsEdgeTTS();
    await tts.setMetadata('pt-BR-FranciscaNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    return new Promise((resolve, reject) => {
        const chunks = [];
        const { audioStream } = tts.toStream(texto);

        audioStream.on('data', (chunk) => chunks.push(chunk));
        audioStream.on('end', () => resolve(Buffer.concat(chunks).toString('base64')));
        audioStream.on('error', reject);
    });
}

async function searchWeb(query) {
    const res = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`);
    const data = await res.json();
    return data.AbstractText || data.RelatedTopics?.[0]?.Text || "Sem resultado";
}

// No systemPrompt, injeta o resultado da busca:
const searchResult = await searchWeb(pergunta);
const systemPrompt = `...
Se precisar de info atual, use este contexto web: "${searchResult}"`;

fastify.post('/api/chat', async (request, reply) => {
    const { pergunta } = request.body;
    const agora = new Date();
    const dataFormatada = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const horaFormatada = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const systemPrompt = `Você é a KIARA, mente neural do GestIQ. Criador: Dudu.
    Hoje é ${dataFormatada}, agora são ${horaFormatada}.
    Responda sempre em JSON: {"texto": "...", "mood": "active"}`;

    async function getAIResponse() {
        try {
            const res = await fetch('https://api.sambanova.ai/v1/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${KEYS.SAMBANOVA}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: "Meta-Llama-3.3-70B-Instruct",
                    messages: [{ role: "system", content: systemPrompt }, { role: "user", content: pergunta }],
                    response_format: { type: "json_object" }
                })
            });
            const data = await res.json();
            return JSON.parse(data.choices[0].message.content);
        } catch (err) {
            const resM = await fetch('https://api.mistral.ai/v1/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${KEYS.MISTRAL}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: "mistral-small-latest",
                    messages: [{ role: "system", content: systemPrompt }, { role: "user", content: pergunta }],
                    response_format: { type: "json_object" }
                })
            });
            const dataM = await resM.json();
            return JSON.parse(dataM.choices[0].message.content);
        }
    }

    try {
        const kiaraData = await getAIResponse();
        console.log("🎙️ [Edge TTS] Gerando voz neural...");

        const audioBase64 = await generateAudio(kiaraData.texto);

        return { ...kiaraData, audio: audioBase64 };
    } catch (err) {
        console.error("🔥 Erro:", err);
        return reply.status(500).send({ error: "Erro na Kiara" });
    }
});

fastify.listen({ port: 3000, host: '0.0.0.0' }, () => {
    console.log('🚀 Kiara 20.0 Online | Edge TTS Neural Ativo');
    exec('start http://localhost:3000');
});