// server.js
const express = require("express");
const cors = require("cors");
const mercadopago = require("mercadopago");

const app = express();

// 🟢 Permitir CORS
app.use(cors({
  origin: [
    "https://serralheria-nine.vercel.app", // seu frontend hospedado na Vercel
    "http://localhost:3000"                // para testes locais
  ],
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// 🟢 Permitir envio de JSON
app.use(express.json());

// 🟣 Configura Mercado Pago
mercadopago.configure({
  access_token: process.env.MERCADO_PAGO_ACCESS_TOKEN
});

// 🔵 Rota para criar preferência
app.post("/create-preference", async (req, res) => {
  try {
    const { planId, price, title } = req.body;

    const preference = {
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

    // 🔹 Cria a preferência diretamente com o SDK oficial
    const response = await mercadopago.preferences.create(preference);

    console.log("Preferência criada com sucesso:", response.body.id);
    res.json({ id: response.body.id });
  } catch (error) {
    console.error("Erro ao criar preferência:", error);
    res.status(500).json({
      error: "Falha ao criar preferência de pagamento.",
      details: error.message
    });
  }
});

// 🟢 Inicia o servidor
const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`✅ Servidor rodando na porta ${port}`);
});
