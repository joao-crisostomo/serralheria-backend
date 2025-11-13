// server.js — Backend completo com Mercado Pago + Webhook + Firebase

const express = require("express");
const cors = require("cors");
const { MercadoPagoConfig, Preference, Payment } = require("mercadopago");
const admin = require("firebase-admin");

// -------------------------------------
// 🔥 1. CONFIGURAÇÕES DO SERVIDOR
// -------------------------------------
const app = express();

// Aceita JSON normalmente
app.use(express.json({ limit: "5mb" }));

// -------------------------------------
// 🔥 CORS DEFINITIVO — 100% COMPATÍVEL COM VERCEL + REACT + SERVICE WORKER
// -------------------------------------
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  next();
});

// Corrige erro 405 em OPTIONS (pré-flight)
app.options("*", (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.sendStatus(200);
});

// -------------------------------------
// 🔥 2. FIREBASE ADMIN
// -------------------------------------
let serviceAccount;

try {
  serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_KEY);
} catch (err) {
  console.error("❌ ERRO: Variável FIREBASE_ADMIN_KEY inválida.");
  console.error("Use JSON em uma única linha com \\n.");
  process.exit(1);
}

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
      valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
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
// 🔥 4. ROTA PARA CRIAR PREFERÊNCIA
// -------------------------------------
app.post("/create-preference", async (req, res) => {
  try {
    const { planId, price, title, userId } = req.body;

    if (!userId) {
      console.log("❌ userId não enviado");
      return res.status(400).json({ error: "userId é obrigatório" });
    }

    console.log("Criando preferência para:", userId);

    const preference = {
      items: [
        {
          id: planId,
          title: `Plano ${title} - Serralheria PRO`,
          quantity: 1,
          unit_price: Number(price),
          currency_id: "BRL",
          description: userId, // vai até o webhook
        },
      ],
      auto_return: "approved",

      back_urls: {
        success: "https://serralheria-nine.vercel.app/sucesso",
        failure: "https://serralheria-nine.vercel.app/falha",
        pending: "https://serralheria-nine.vercel.app/pendente",
      },

      notification_url: "https://serralheria-backend.onrender.com/webhook",
    };

    const pref = new Preference(client);
    const response = await pref.create({ body: preference });

    console.log("Preferência criada:", response.id);

    res.json({ id: response.id });
  } catch (error) {
    console.error("❌ Erro ao criar preferência:", error);
    res.status(500).json({ error: "Erro ao criar preferência" });
  }
});

// =========================
// 🔥 PROCESSAR PAGAMENTO
// =========================
app.post("/process-payment", async (req, res) => {
  try {
    const {
      token,
      issuer_id,
      payment_method_id,
      transaction_amount,
      installments,
      userId,
    } = req.body;

    const paymentClient = new Payment(client);

    const response = await paymentClient.create({
      body: {
        token,
        issuer_id,
        payment_method_id,
        transaction_amount,
        installments,
        payer: {
          email: "test_user@test.com", // obrigatório
          identification: {
            type: "CPF",
            number: "19119119100", // CPF de teste FIXO
          },
        },
      },
    });

    console.log("Pagamento recebido:", response);

    if (response.status === "approved") {
      await activateUserPlan(userId);
    }

    res.json(response);
  } catch (err) {
    console.error("❌ Erro ao processar pagamento:", err);
    res.status(500).json({ error: "Erro ao processar pagamento" });
  }
});

// -------------------------------------
// 🔥 5. WEBHOOK DO MERCADO PAGO
// -------------------------------------
app.post("/webhook", async (req, res) => {
  try {
    console.log("📩 Webhook recebido:", req.body);

    const event = req.body;

    if (event.type !== "payment") {
      return res.sendStatus(200);
    }

    const paymentId = event.data.id;

    const paymentClient = new Payment(client);
    const paymentData = await paymentClient.get({ id: paymentId });

    console.log("🔍 Dados do pagamento:", paymentData);

    if (paymentData.status === "approved") {
      const userId = paymentData.additional_info?.items?.[0]?.description;

      if (!userId) {
        console.log("❌ userId não encontrado no pagamento");
      } else {
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
// 🔥 6. Rota padrão para teste
// -------------------------------------
app.get("/", (req, res) => {
  res.send("Backend Serralheria PRO está online! ✔️");
});

// -------------------------------------
// 🔥 7. Inicialização
// -------------------------------------
const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log("🚀 Servidor rodando na porta", port);
});
