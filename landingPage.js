function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const INLINE_CSS = `
  @import url('https://fonts.googleapis.com/css?family=Antic');

  * { box-sizing: border-box; }

  body {
    margin: 0;
    padding: 0;
    font-family: 'Antic', ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
    color: var(--text);
    background-color: var(--bg);
    min-height: 100vh;
    position: relative;
    overflow-x: hidden;
  }

  a { color: inherit; text-decoration: none; }

  #particleCanvas {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: -1;
    background: var(--bg);
    opacity: 0.6;
  }

  .wrap {
    max-width: 1080px;
    margin: 0 auto;
    padding: 28px 16px 70px;
    position: relative;
    z-index: 1;
    background: transparent;
  }

  .nav {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    border: 1px solid var(--stroke);
    border-radius: 16px;
    background: rgba(16, 49, 107, 0.2);
    box-shadow: var(--shadow);
    backdrop-filter: blur(12px);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 800;
    letter-spacing: 0.4px;
  }

  .brand .dot {
    width: 10px;
    height: 10px;
    border-radius: 999px;
    background: var(--accent);
    box-shadow: 0 0 22px var(--accent);
  }

  .cta {
    padding: 10px 14px;
    border-radius: 999px;
    border: 1px solid var(--stroke);
    background: rgba(16, 49, 107, 0.35);
  }

  .hero {
    display: grid;
    grid-template-columns: 1.2fr 0.8fr;
    gap: 18px;
    margin-top: 18px;
  }

  .card {
    border: 1px solid var(--stroke);
    border-radius: 18px;
    background: var(--card);
    box-shadow: var(--shadow);
    backdrop-filter: blur(12px);
  }

  .heroLeft, .heroRight, .section {
    padding: 18px;
  }

  .kicker { color: var(--muted); font-size: 13px; }

  h1 {
    margin: 10px 0 8px;
    font-size: clamp(32px, 5vw, 54px);
    line-height: 1.05;
    letter-spacing: -1.5px;
    text-shadow: 0 0 20px rgba(20, 151, 252, 0.3);
  }

  h2 { margin: 0 0 10px; font-size: 22px; }

  .sub { color: var(--muted); font-size: 16px; line-height: 1.5; }

  .row {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: 14px;
    align-items: center;
  }

  .btn {
    padding: 12px 16px;
    border-radius: 14px;
    border: 1px solid var(--stroke);
    background: rgba(16, 49, 107, 0.45);
    cursor: pointer;
    display: inline-flex;
    gap: 10px;
    align-items: center;
    transition: all 0.3s ease;
  }

  .btn:hover {
    box-shadow: 0 0 25px rgba(20, 151, 252, 0.4);
    transform: translateY(-1px);
  }

  .btn strong { font-weight: 800; }
  .ghost { background: rgba(0, 0, 0, 0.3); }

  .list {
    margin: 10px 0 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 10px;
  }

  .li {
    padding: 12px;
    border-radius: 14px;
    border: 1px solid var(--stroke);
    background: rgba(16, 49, 107, 0.3);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin-top: 14px;
  }

  .mini { padding: 16px; }
  .mini h3 { margin: 0 0 8px; font-size: 16px; }
  .mini p { margin: 0; color: var(--muted); line-height: 1.45; font-size: 14px; }

  details {
    border: 1px solid var(--stroke);
    border-radius: 14px;
    padding: 12px;
    background: rgba(16, 49, 107, 0.2);
  }

  summary { cursor: pointer; font-weight: 700; }

  .foot {
    margin-top: 18px;
    color: var(--muted);
    font-size: 12px;
    text-align: center;
  }

  @media (max-width: 880px) {
    .hero, .grid { grid-template-columns: 1fr; }
  }
`;

export function buildLandingPageHtml({
  brand = "Sua Marca",
  headline = "Aumente suas vendas com uma oferta irresistível",
  subheadline = "Uma proposta clara, prova social e CTA forte, otimizado para conversão.",
  cta = "Quero falar no WhatsApp",
  whatsapp = "",
  primaryColor = "#1497FC",
  niche = "",
  bullets = [],
  faq = [],
}) {
  const safeBullets = Array.isArray(bullets) && bullets.length
    ? bullets.slice(0, 6)
    : [
        "Benefício principal em 1 frase (mensurável)",
        "Entrega rápida e simples (sem fricção)",
        "Prova ou garantia para reduzir risco percebido",
        "Suporte e acompanhamento",
      ];

  const safeFaq = Array.isArray(faq) && faq.length
    ? faq.slice(0, 6)
    : [
        { q: "Quanto tempo leva para ver resultado?", a: "Depende do cenário. Você terá um plano em 7 dias e execução contínua." },
        { q: "Funciona para o meu nicho?", a: "Sim, adaptamos proposta, criativos e funil conforme público e oferta." },
        { q: "Como começamos?", a: "Clique no botão, responda 3 perguntas e agendamos o kickoff." },
      ];

  const waLink = whatsapp ? `https://wa.me/${encodeURIComponent(whatsapp.replace(/\D/g, ""))}` : "";
  const ctaHref = waLink || "#form";

  return `<!doctype html>
<html lang="pt-br">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${esc(brand)} - ${esc(headline)}</title>
  <meta name="description" content="${esc(subheadline)}" />
  <style>
    :root {
      --bg: #081029;
      --card: rgba(20, 38, 77, 0.3);
      --text: #e9eefc;
      --muted: rgba(233, 238, 252, 0.7);
      --stroke: rgba(18, 118, 219, 0.25);
      --accent: ${esc(primaryColor)};
      --shadow: 0 18px 60px rgba(0, 0, 0, 0.5);
    }

${INLINE_CSS}
  </style>
</head>
<body>
  <canvas id="particleCanvas"></canvas>

  <div class="wrap">
    <div class="nav">
      <div class="brand"><span class="dot"></span><span>${esc(brand)}</span></div>
      <a class="cta" href="${esc(ctaHref)}">Falar agora</a>
    </div>

    <div class="hero">
      <div class="card heroLeft">
        <div class="kicker">${esc(niche ? `Para ${niche}` : "Landing page otimizada")}</div>
        <h1>${esc(headline)}</h1>
        <div class="sub">${esc(subheadline)}</div>
        <div class="row">
          <a class="btn" href="${esc(ctaHref)}"><strong>${esc(cta)}</strong> <span>&rarr;</span></a>
          <a class="btn ghost" href="#faq">Tirar dúvidas</a>
        </div>
        <div class="grid">
          <div class="card mini">
            <h3>Oferta clara</h3>
            <p>Uma proposta específica, com benefício e prova, sem enrolação.</p>
          </div>
          <div class="card mini">
            <h3>Menos fricção</h3>
            <p>CTA forte e próxima etapa simples para aumentar conversão.</p>
          </div>
          <div class="card mini">
            <h3>Métricas</h3>
            <p>Defina KPI como leads, taxa e CAC e rode testes contínuos.</p>
          </div>
        </div>
      </div>

      <div class="card heroRight" id="form">
        <div class="kicker">Próximo passo</div>
        <h2 style="margin:8px 0 6px;">Responder 3 perguntas</h2>
        <div class="sub">Isso ajuda a personalizar a oferta e acelerar a entrega.</div>
        <ul class="list">
          ${safeBullets.map((b) => `<li class="li">✅ ${esc(b)}</li>`).join("\n")}
        </ul>
        <div class="row" style="margin-top:14px;">
          <a class="btn" href="${esc(ctaHref)}"><strong>${esc(cta)}</strong> <span>&rarr;</span></a>
        </div>
        <div class="foot">Dica: conecte este CTA ao WhatsApp, Calendly ou formulário.</div>
      </div>
    </div>

    <div class="card section" id="faq">
      <h2>Perguntas frequentes</h2>
      <div style="display:grid; gap:10px;">
        ${safeFaq
          .map(
            (f) => `<details><summary>${esc(f.q)}</summary><div style="margin-top:8px;color:var(--muted);line-height:1.45;">${esc(f.a)}</div></details>`,
          )
          .join("\n")}
      </div>
    </div>

    <div class="foot">Gerado pela KIARA • Ajuste copy, cores e CTA conforme sua oferta</div>
  </div>

  <script>
    const canvas = document.getElementById("particleCanvas");
    const ctx = canvas.getContext("2d");
    const particles = [];

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }

    window.addEventListener("resize", resize);
    resize();

    class Particle {
      constructor() {
        this.angle = Math.random() * Math.PI * 2;
        this.dist = Math.random() * 180;
        this.size = Math.random() * 1.2 + 0.6;
        this.speed = (Math.random() - 0.5) * 0.01;
        this.opacity = Math.random() * 0.5 + 0.2;
        this.phaseX = Math.random() * Math.PI * 2;
        this.phaseY = Math.random() * Math.PI * 2;
      }

      update() {
        const now = Date.now();
        this.angle += this.speed;
        const pulse = Math.sin(now * 0.002) * 10;
        const radius = this.dist + pulse;
        const baseX = canvas.width / 2 + Math.cos(this.angle) * radius;
        const baseY = canvas.height / 2 + Math.sin(this.angle) * radius;
        this.x = baseX + Math.sin(now * 0.001 + this.phaseX) * 20;
        this.y = baseY + Math.cos(now * 0.0015 + this.phaseY) * 20;
      }

      draw() {
        ctx.fillStyle = "rgba(24, 240, 255, " + this.opacity + ")";
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (let i = 0; i < 200; i++) particles.push(new Particle());

    function animate() {
      ctx.fillStyle = "rgba(8, 16, 41, 0.15)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      particles.forEach((particle) => {
        particle.update();
        particle.draw();
      });
      requestAnimationFrame(animate);
    }

    animate();
  </script>
</body>
</html>`;
}
