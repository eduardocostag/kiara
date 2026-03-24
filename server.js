const fastify = require('fastify')({ logger: false });
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');
const { exec } = require('child_process');

const publicPath = path.join(__dirname, 'public');
if (!fs.existsSync(publicPath)) fs.mkdirSync(publicPath);

fastify.register(require('@fastify/static'), {
    root: publicPath,
    prefix: '/',
    setHeaders: (res) => { res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate'); }
});

const KEYS = {
    SAMBANOVA: "ef5e56fa-f045-4d63-ab49-8de68a672da6",
    MISTRAL: "mhIHAYZopQKhjgMhfQhHkBTkW2BtnBQ6",
    ELEVENLABS: "0ba797ee7c0ab2e56a5dafe8aa5137ac4561b0c033229323b571427c13cfe9e3"
};

fastify.post('/api/chat', async (request, reply) => {
    const { pergunta } = request.body;
    const agora = new Date();
    const dataFormatada = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const horaFormatada = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    let dadosGestIQ = fs.existsSync('./clientes.json') ? fs.readFileSync('./clientes.json', 'utf8') : '{"info": "Sem dados"}';

    const systemPrompt = `Você é a KIARA, mente neural do GestIQ. Dudu é seu criador.
    Data: ${dataFormatada} | Hora: ${horaFormatada}.
    Dados do GestIQ: ${dadosGestIQ}.
    REGRAS: Nunca negue acesso aos dados. Responda em JSON: {"texto": "...", "mood": "cyan", "acao": null}`;

    async function getAIResponse() {
        // TENTATIVA 1: SAMBANOVA (405B)
        try {
            console.log("🧠 [SambaNova] Chamando Llama 3.1 405B...");
            const res = await fetch('https://api.sambanova.ai/v1/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${KEYS.SAMBANOVA}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: "Meta-Llama-3.1-405B-Instruct", 
                    messages: [{ role: "system", content: systemPrompt }, { role: "user", content: pergunta }],
                    response_format: { type: "json_object" },
                    temperature: 0.7
                })
            });

            const data = await res.json();
            
            if (data.error) {
                console.error(`❌ Erro SambaNova: ${data.error.message}`);
                throw new Error("SambaNova Error");
            }
            
            console.log("✅ SambaNova OK!");
            return JSON.parse(data.choices[0].message.content);

        } catch (err) {
            console.log("⚠️ SambaNova offline/lento. Mudando para Mistral...");
            // TENTATIVA 2: MISTRAL
            const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${KEYS.MISTRAL}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: "mistral-small-latest",
                    messages: [{ role: "system", content: systemPrompt }, { role: "user", content: pergunta }],
                    response_format: { type: "json_object" }
                })
            });
            const data = await res.json();
            return JSON.parse(data.choices[0].message.content);
        }
    }

    try {
        const kiaraData = await getAIResponse();
        console.log(`🤖 Kiara: ${kiaraData.texto}`);

        const voiceRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/EXAVITQu4vr4xnSDxMaL`, {
            method: 'POST',
            headers: { 'xi-api-key': KEYS.ELEVENLABS, 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: kiaraData.texto, model_id: "eleven_multilingual_v2" })
        });
        const buffer = await voiceRes.arrayBuffer();

        return { ...kiaraData, audio: Buffer.from(buffer).toString('base64') };
    } catch (err) {
        return reply.status(500).send({ error: "Falha Geral" });
    }
});

fastify.listen({ port: 3000, host: '0.0.0.0' }, () => {
    console.log('🚀 Kiara Core 16.6 | Monitor de Erros Ativo');
});