const fastify = require('fastify')({ logger: false });
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');
const { exec } = require('child_process');
const { EdgeTTS } = require('edge-tts-node'); // Motor simplificado

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

const tts = new EdgeTTS();

fastify.post('/api/chat', async (request, reply) => {
    const { pergunta } = request.body;
    
    // Contexto de tempo para a Kiara
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
        console.log("🎙️ [Edge TTS] Gerando voz neural gratuita...");
        
        const fileName = `voz_${Date.now()}.mp3`; // Nome único para evitar erro de cache
        const filePath = path.join(publicPath, fileName);
        
        // pt-BR-FranciscaNeural é a voz feminina padrão do Edge
        await tts.ttsPromise(kiaraData.texto, filePath, "pt-BR-FranciscaNeural");

        const audioBuffer = fs.readFileSync(filePath);
        
        // Limpa o arquivo logo após ler para não encher o HD
        setTimeout(() => { if(fs.existsSync(filePath)) fs.unlinkSync(filePath); }, 5000);

        return { ...kiaraData, audio: audioBuffer.toString('base64') };
    } catch (err) { 
        console.error("🔥 Erro:", err);
        return reply.status(500).send({ error: "Erro na Kiara" }); 
    }
});

fastify.listen({ port: 3000, host: '0.0.0.0' }, () => {
    console.log('🚀 Kiara 18.6 Online | Design Travado | Voz Ativa');
    exec('start http://localhost:3000');
});