function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildLandingPageHtml({
  brand = "Sua Marca",
  headline = "Aumente suas vendas com uma oferta irresistível",
  subheadline = "Uma proposta clara, prova social e CTA forte — otimizado para conversão.",
  cta = "Quero falar no WhatsApp",
  whatsapp = "",
  primaryColor = "#1497FC",
  niche = "",
  bullets = [],
  faq = [],
}) {
  const safeBullets = Array.isArray(bullets) && bullets.length ? bullets.slice(0, 6) : [
    "Benefício principal em 1 frase (mensurável)",
    "Entrega rápida e simples (sem fricção)",
    "Prova/garantia (reduz risco percebido)",
    "Suporte e acompanhamento",
  ];

  const safeFaq = Array.isArray(faq) && faq.length ? faq.slice(0, 6) : [
    { q: "Quanto tempo leva para ver resultado?", a: "Depende do cenário. Você terá um plano em 7 dias e execução contínua." },
    { q: "Funciona para o meu nicho?", a: "Sim — adaptamos a proposta, criativos e funil conforme público e oferta." },
    { q: "Como começamos?", a: "Clique no botão, responda 3 perguntas e agendamos o kickoff." },
  ];

  const waLink = whatsapp ? `https://wa.me/${encodeURIComponent(whatsapp.replace(/\D/g, ""))}` : "";
  const ctaHref = waLink || "#form";

  return `<!doctype html>
<html lang="pt-br">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${esc(brand)} — ${esc(headline)}</title>
  <meta name="description" content="${esc(subheadline)}" />
  <style>
    :root {
      --bg: #081029;
      --card: rgba(20, 38, 77, 0.3);
      --card2: rgba(20, 38, 77, 0.5);
      --text: #e9eefc;
      --muted: rgba(233,238,252,0.7);
      --stroke: rgba(18, 118, 219, 0.25);
      --accent: ${esc(primaryColor)};
      --shadow: 0 18px 60px rgba(0,0,0,0.5);
    }
  </style>
  <style>
    #particleCanvas {
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      z-index: -1;
      background: var(--bg);
      opacity: 0.6;
    }
    .wrap {
      position: relative;
      background: transparent !important;
    }
  </style>
  <link rel="stylesheet" href="/styles/landing.css">
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
          <a class="btn" href="${esc(ctaHref)}"><strong>${esc(cta)}</strong> <span>→</span></a>
          <a class="btn ghost" href="#faq">Tirar dúvidas</a>
        </div>
        <div class="grid">
          <div class="card mini">
            <h3>Oferta clara</h3>
            <p>Uma proposta específica, com benefício e prova, sem enrolação.</p>
          </div>
          <div class="card mini">
            <h3>Menos fricção</h3>
            <p>CTA forte + próxima etapa simples para aumentar conversão.</p>
          </div>
          <div class="card mini">
            <h3>Métricas</h3>
            <p>Defina KPI (leads, taxa, CAC) e rode testes contínuos.</p>
          </div>
        </div>
      </div>

      <div class="card heroRight" id="form">
        <div class="kicker">Próximo passo</div>
        <h2 style="margin:8px 0 6px;">Responder 3 perguntas</h2>
        <div class="sub">Isso ajuda a personalizar a oferta e acelerar a entrega.</div>
        <ul class="list">
          ${safeBullets
            .map((b) => `<li class="li">✅ ${esc(b)}</li>`)
            .join("\n")}
        </ul>
        <div class="row" style="margin-top:14px;">
          <a class="btn" href="${esc(ctaHref)}"><strong>${esc(cta)}</strong> <span>→</span></a>
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

    <div class="foot">Gerado pela KIARA • Ajuste copy/cores/CTA conforme sua oferta</div>
  </div>

  <script>
    const canvas = document.getElementById('particleCanvas');
    const ctx = canvas.getContext('2d');
    let particles = [];

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);
    resize();

    class Particle {
      constructor() {
        this.angle = Math.random() * Math.PI * 2;
        this.dist = Math.random() * 180; // Ampliado o orbe
        this.size = Math.random() * 1.2 + 0.6; // Partículas menores
        this.speed = (Math.random() - 0.5) * 0.01;
        this.opacity = Math.random() * 0.5 + 0.2;
        this.phaseX = Math.random() * Math.PI * 2;
        this.phaseY = Math.random() * Math.PI * 2;
      }
      update() {
        const now = Date.now();
        this.angle += this.speed;
        const pulse = Math.sin(now * 0.002) * 10;
        const r = this.dist + pulse;

        const baseX = canvas.width / 2 + Math.cos(this.angle) * r;
        const baseY = canvas.height / 2 + Math.sin(this.angle) * r;

        // Movimento em outras direções além da circular
        this.x = baseX + Math.sin(now * 0.001 + this.phaseX) * 20;
        this.y = baseY + Math.cos(now * 0.0015 + this.phaseY) * 20;
      }
      draw() {
        ctx.fillStyle = `rgba(24, 240, 255, ${this.opacity})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (let i = 0; i < 200; i++) particles.push(new Particle()); // Mais partículas

    function animate() {
      // O fundo da landing page é #081029, usamos a mesma cor com alpha para o rastro
      ctx.fillStyle = "rgba(8, 16, 41, 0.15)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => { p.update(); p.draw(); });
      requestAnimationFrame(animate);
    }
    animate();
  </script>
</body>
</html>`;
}
