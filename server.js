// server.js
const cors = require('cors');
const express = require("express");
const mercadopago = require("mercadopago");
const cors = require("cors");

const app = express();
app.use(cors({
  origin: 'https://serralheria-nine.vercel.app'
}));
app.use(cors());
app.use(express.json());

// Configura o cliente Mercado Pago com a variável de ambiente
const client = new mercadopago.MercadoPagoConfig({
  accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN,
});

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
        success: "https://SUA-URL-DE-SUCESSO.COM",
        failure: "https://SUA-URL-DE-FALHA.COM",
        pending: "",
      },
      auto_return: "approved",
    };

    const preferenceInstance = new mercadopago.Preference(client);
    const response = await preferenceInstance.create({ body: preference });

    console.log("Preferência criada com sucesso:", response.id);
    res.json({ id: response.id });
  } catch (error) {
    console.error("Erro ao criar preferência:", error);
    res.status(500).json({ error: "Falha ao criar preferência de pagamento." });
  }
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`Seu app está escutando na porta ${port}`);
});
