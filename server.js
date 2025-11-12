// Importa as bibliotecas necessárias
const express = require("express");
const mercadopago = require("mercadopago");
const cors = require("cors"); // Importa o CORS

// Cria a aplicação Express
const app = express();

// Habilita o CORS para permitir que seu frontend (de outro domínio) acesse este backend
app.use(cors()); 

// Habilita o Express para entender JSON no corpo das requisições
app.use(express.json());

// Configura o SDK do Mercado Pago com sua chave secreta, lida do ambiente
mercadopago.configure({
  access_token: process.env.MERCADO_PAGO_ACCESS_TOKEN,
});


// Define a rota principal para criar a preferência de pagamento
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
        },
      ],
      back_urls: {
        success: "https://SUA-URL-DE-SUCESSO.COM",
        failure: "https://SUA-URL-DE-FALHA.COM",
        pending: "",
      },
      auto_return: "approved",
    };

    const response = await mercadopago.preferences.create(preference);

    console.log("Preferência criada com sucesso:", response.body.id);
    res.json({ id: response.body.id });

  } catch (error) {
    console.error("Erro ao criar preferência:", error);
    res.status(500).json({ error: "Falha ao criar preferência de pagamento." });
  }
});


// Inicia o servidor para escutar por requisições
// O Render usa a variável de ambiente PORT, então isso funciona perfeitamente.
const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`Seu app está escutando na porta ${port}`);
});