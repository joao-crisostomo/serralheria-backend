// server.js
const express = require("express");
const cors = require("cors");
const mercadopago = require("mercadopago");

const { MercadoPagoConfig, Preference } = mercadopago; // ✅ novo SDK usa classes

const app = express();

app.use(cors({
  origin: [
    "https://serralheria-nine.vercel.app",
    "http://localhost:3000"
  ],
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());

// ⚙️ Configuração correta no novo SDK
const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN,
});

// 🟣 Rota para criar preferência
app.post("/create-preference", async (req, res) => {
  try {
    const { planId, price, title } = req.body;

    const body = {
      items: [
        {
          id: planId,
          title: `Plano ${title} - Serralheria PRO`,
          quantity: 1,
          unit_price: Number(price),
          currency_id: "BRL",
        },
      ],
      back_urls: {
        success: "https://serralheria-nine.vercel.app/success",
        failure: "https://serralheria-nine.vercel.app/failure",
        pending: "https://serralheria-nine.vercel.app/pending",
      },
      auto_return: "approved",
    };

    // ✅ Cria preferência com o novo formato (SDK v2)
    const preference = new Preference(client);
    const result = await preference.create({ body });

    console.log("Preferência criada com sucesso:", result.id);
    res.json({ id: result.id });
  } catch (error) {
    console.error("Erro ao criar preferência:", error);
    res.status(500).json({
      error: "Falha ao criar preferência de pagamento.",
      details: error.message,
    });
  }
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`✅ Servidor rodando na porta ${port}`);
});
