import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL);

// salvar memória
export async function saveMemory(pergunta, resposta) {
  await redis.lpush(
    "kiara_memory",
    JSON.stringify({
      pergunta,
      resposta,
      time: Date.now()
    })
  );
}

// buscar memória relevante
export async function getRelevantMemory(pergunta) {
  const data = await redis.lrange("kiara_memory", 0, 100);

  const palavras = pergunta.toLowerCase().split(" ");

  return data
    .map((item) => {
      try {
        const m = JSON.parse(item);

        const texto = `${m.pergunta} ${m.resposta}`.toLowerCase();

        const relevancia = palavras.filter((p) =>
          texto.includes(p)
        ).length;

        return { ...m, relevancia };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.relevancia - a.relevancia)
    .slice(0, 5)
    .map((m) => `Usuário: ${m.pergunta}\nKIARA: ${m.resposta}`)
    .join("\n\n");
}