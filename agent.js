export async function executarAcao(resposta) {
  const texto = resposta.toLowerCase();

  if (texto.includes("abrir youtube")) {
    return {
      action: "open_url",
      url: "https://youtube.com"
    };
  }

  if (texto.includes("abrir google")) {
    return {
      action: "open_url",
      url: "https://google.com"
    };
  }

  if (texto.includes("tocar música")) {
    return {
      action: "open_url",
      url: "https://www.youtube.com/results?search_query=musica"
    };
  }

  return null;
}