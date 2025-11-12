// server.js — Backend completo com Mercado Pago + Webhook + Firebase

const express = require("express");
const cors = require("cors");
const { MercadoPagoConfig, Preference, Payment } = require("mercadopago");
const admin = require("firebase-admin");

// -------------------------------------
// 🔥 1. CONFIGURAÇÕES DO SERVIDOR
// -------------------------------------
const app = express();
app.use(express.json());

// CORS liberado para seu frontend na Vercel
app.use(
  cors({
    origin: [
      "https://serralheria-nine.vercel.app",
      "http://localhost:3000",
    ],
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  })
);

// -------------------------------------
// 🔥 2. FIREBASE ADMIN (para ativar plano)
// -------------------------------------
const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_KEY);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function activateUserPlan(userId) {
  console.log("⏳ Ativando plano para o usuário:", userId);

  const userRef = db.collection("users").doc(userId);
  await userRef.set(
    {
      plan: "pro",
      activated_at: new Date().toISOString(),
      valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // +30 dias
    },
    { merge: true }
  );

  console.log("✅ Plano ativado com sucesso para:", userId);
}

// -------------------------------------
// 🔥 3. MERCADO PAGO SDK v2
// -------------------------------------
const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

// -------------------------------------
// 🔥 4. Rota para criar preferência
// -------------------------------------
app.post("/create-preference", async (req, res) => {
  try {
    const { planId, price, title, userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "userId é obrigatório" });
    }

    const preference = {
      items: [
        {
          id: planId,
          title: `Plano ${title} - Serralheria PRO`,
          quantity: 1,
          unit_price: Number(price),
          currency_id: "BRL",
          description: userId, // 🔥 O userId vai pelo Mercado Pago até o webhook
        },
      ],
      notification_url: "https://serralheria-backend.onrender.com/webhook",
      auto_return: "approved",
    };

    const pref = new Preference(client);
    const response = await pref.create({ body: preference });

    console.log("Preferência criada:", response.id);

    res.json({ id: response.id });
  } catch (error) {
    console.error("Erro ao criar preferência:", error);
    res.status(500).json({ error: "Erro ao criar preferência" });
  }
});

// -------------------------------------
// 🔥 5. Webhook do Mercado Pago
// -------------------------------------
app.post("/webhook", async (req, res) => {
  try {
    const event = req.body;

    console.log("📩 Webhook recebido:", JSON.stringify(event, null, 2));

    if (event.type === "payment") {
      const paymentId = event.data.id;

      const paymentClient = new Payment(client);
      const paymentData = await paymentClient.get({ id: paymentId });

      console.log("🔍 Dados do pagamento:", paymentData);

      if (paymentData.status === "approved") {
        const userId = paymentData.additional_info.items[0].description;

        await activateUserPlan(userId);
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Erro no webhook:", err);
    res.sendStatus(500);
  }
});

// -------------------------------------
// 🔥 6. Inicialização
// -------------------------------------
const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log("🚀 Servidor rodando na porta", port);
});
