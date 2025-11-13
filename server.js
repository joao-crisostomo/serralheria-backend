// server.js — Backend com Mercado Pago (suporta SANDBOX) + Webhook + Firebase
// Regras: defina no Render:
// - FIREBASE_ADMIN_KEY  (JSON do service account em 1 linha com \n)
// - MP_ACCESS_TOKEN     (token produção)  <-- opcional
// - MP_TEST_ACCESS_TOKEN (token de teste)  <-- recomendado para desenvolvimento

const express = require("express");
const cors = require("cors");
const { MercadoPagoConfig, Preference, Payment } = require("mercadopago");
const admin = require("firebase-admin");

// ----------- App ----------
const app = express();
app.use(express.json({ limit: "5mb" }));

// ----------- CORS (recomendo especificar suas origens aqui) -----------
const ALLOWED_ORIGINS = [
  "https://serralheria-nine.vercel.app",
  "http://localhost:3000",
  // adicione outros frontends que você usar
];

app.use((req, res, next) => {
  const origin = req.get("origin");
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  } else {
    // fallback (não forçar *) — se quiser liberar totalmente, troque por "*"
    res.header("Access-Control-Allow-Origin", "*");
  }
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  next();
});
app.options("*", (req, res) => res.sendStatus(200));

// ----------- FIREBASE ADMIN -----------
let serviceAccount;
try {
  if (!process.env.FIREBASE_ADMIN_KEY) {
    console.error("❌ FIREBASE_ADMIN_KEY não definida nas env vars.");
    process.exit(1);
  }
  serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_KEY);
} catch (err) {
  console.error("❌ ERRO: FIREBASE_ADMIN_KEY inválida. Use JSON em 1 linha com \\n.", err);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

async function activateUserPlan(userId) {
  try {
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
    console.log("✅ Plano ativado para:", userId);
  } catch (err) {
    console.error("❌ Erro ao ativar plano no Firestore:", err);
  }
}

// ----------- Mercado Pago: escolhe token (test x prod) -----------
const accessToken =
  process.env.MP_ACCESS_TOKEN && process.env.MP_ACCESS_TOKEN.length
    ? process.env.MP_ACCESS_TOKEN
    : process.env.MP_TEST_ACCESS_TOKEN;

if (!accessToken) {
  console.error("❌ Nenhum token do Mercado Pago encontrado. Defina MP_ACCESS_TOKEN ou MP_TEST_ACCESS_TOKEN.");
  process.exit(1);
}

const isTestMode = !!process.env.MP_TEST_ACCESS_TOKEN && (!process.env.MP_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN === "");
console.log("🔁 Mercado Pago - modo:", isTestMode ? "TEST (sandbox)" : "PRODUCTION");
const client = new MercadoPagoConfig({ accessToken });

// ----------- Rota: criar preferência -----------
app.post("/create-preference", async (req, res) => {
  try {
    const { planId, price, title, userId } = req.body;

    if (!userId) return res.status(400).json({ error: "userId é obrigatório" });
    if (!planId || !price || !title) return res.status(400).json({ error: "planId, price e title são obrigatórios" });

    console.log("Criando preferência para userId:", userId, "plan:", planId, "price:", price);

    const preference = {
      items: [
        {
          id: planId,
          title: `Plano ${title} - Serralheria PRO`,
          quantity: 1,
          unit_price: Number(price),
          currency_id: "BRL",
          description: userId, // passa o userId até o webhook
        },
      ],
      auto_return: "approved",
      back_urls: {
        success: "https://serralheria-nine.vercel.app/sucesso",
        failure: "https://serralheria-nine.vercel.app/falha",
        pending: "https://serralheria-nine.vercel.app/pendente",
      },
      // IMPORTANTE: se você usar Render/Heroku verifique este URL (tem que aceitar POST)
      notification_url: process.env.PAYMENTS_NOTIFICATION_URL || "https://serralheria-backend.onrender.com/webhook",
    };

    const pref = new Preference(client);
    const response = await pref.create({ body: preference });

    console.log("Preferência criada (id):", response.id);
    // resposta ao frontend (só precisa do id)
    return res.json({ id: response.id, raw: response });
  } catch (error) {
    console.error("❌ Erro ao criar preferência:", error);
    // Se for problema de políticas (403) damos dica
    if (error && error.status === 403) {
      return res.status(403).json({
        error: "PA_UNAUTHORIZED_RESULT_FROM_POLICIES",
        message:
          "A requisição foi bloqueada por políticas do Mercado Pago (403). Use token de teste ou verifique credenciais de produção.",
        detail: error,
      });
    }
    return res.status(500).json({ error: "Erro ao criar preferência", detail: String(error) });
  }
});

// ----------- (OPCIONAL) Rota: processar pagamento direto (card tokens) -----------
// Use apenas se quiser processar cartão do frontend (não necessário para o Brick Wallet).
app.post("/process-payment", async (req, res) => {
  try {
    const { token, issuer_id, payment_method_id, transaction_amount, installments, userId } = req.body;

    if (!token || !payment_method_id || !transaction_amount || !userId) {
      return res.status(400).json({ error: "token, payment_method_id, transaction_amount e userId são obrigatórios" });
    }

    const paymentClient = new Payment(client);
    const resp = await paymentClient.create({
      body: {
        token,
        issuer_id,
        payment_method_id,
        transaction_amount: Number(transaction_amount),
        installments: Number(installments || 1),
        payer: {
          email: "test_user@test.com",
          identification: {
            type: "CPF",
            number: "19119119100",
          },
        },
      },
    });

    console.log("Pagamento criado:", resp);

    // se aprovado, ativa plano
    if (resp.status === "approved" && userId) {
      await activateUserPlan(userId);
    }

    return res.json(resp);
  } catch (err) {
    console.error("❌ Erro ao processar pagamento:", err);
    return res.status(500).json({ error: "Erro ao processar pagamento", detail: String(err) });
  }
});

// ----------- Webhook (IPN) do Mercado Pago -----------
app.post("/webhook", async (req, res) => {
  try {
    console.log("📩 Webhook recebido (body):", JSON.stringify(req.body).slice(0, 2000));

    const event = req.body;

    // muitos IPNs chegam como querystring (topic + id) – MercadoPago envia POST com JSON porém checamos tudo
    if (event.topic === "payment" || event.type === "payment") {
      const paymentId = event.id || (event.data && event.data.id);
      if (!paymentId) {
        console.log("⚠️ paymentId não encontrado no evento:", event);
        return res.sendStatus(200);
      }

      const paymentClient = new Payment(client);
      const paymentData = await paymentClient.get({ id: paymentId });

      console.log("🔍 Dados do pagamento:", paymentData);

      if (paymentData && paymentData.status === "approved") {
        const userId = paymentData.additional_info?.items?.[0]?.description;
        if (userId) {
          await activateUserPlan(userId);
        } else {
          console.log("⚠️ userId não encontrado em payment.additional_info");
        }
      }

      return res.sendStatus(200);
    }

    // NÃO é evento de pagamento — responder OK
    return res.sendStatus(200);
  } catch (err) {
    console.error("❌ Erro no webhook:", err);
    return res.sendStatus(500);
  }
});

// ----------- rota teste -----------
app.get("/", (req, res) => res.send("Backend Serralheria PRO está online! ✔️"));

// ----------- start -----------
const port = process.env.PORT || 3001;
app.listen(port, () => console.log("🚀 Backend rodando na porta", port));
