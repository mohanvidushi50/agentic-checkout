const express = require("express");
const { issueIntentMandate, verifyPurchase } = require("./mandates.js");
const app = express();
app.use(express.json());
app.use(express.static("public"));

let catalog = [];
let auditLog = [];

function logAudit(entry) {
  auditLog.push({ timestamp: new Date().toISOString(), ...entry });
}

app.get("/catalog", (req, res) => {
  res.json(catalog);
});

app.get("/audit", (req, res) => {
  res.json(auditLog);
});

app.post("/mandates/intent", (req, res) => {
  const { maxAmount, category } = req.body;
  const token = issueIntentMandate(maxAmount, category);
  logAudit({ actor: "user", action: "issue_intent_mandate", detail: { maxAmount, category } });
  res.json({ token: token });
});

app.post("/checkout", (req, res) => {
  const { token, proposedAmount, proposedCategory } = req.body;
  const result = verifyPurchase(token, proposedAmount, proposedCategory);
  logAudit({ actor: "verifier", action: "gate_decision", detail: result });
  if (result.allowed === false) {
    return res.status(403).json(result);
  } else {
    return res.json(result);
  }
});

function createMockOrder(amount) {
  return {
    id: "order_MOCK" + Math.random().toString(36).slice(2, 12),
    amount: amount * 100,
    currency: "INR",
    status: "created",
  };
}

app.post("/chat", (req, res) => {
  const { message } = req.body;
  logAudit({ actor: "user", action: "chat_message", detail: message });

  const amountMatch = message.match(/(?:under|up to|max)\s*(?:₹|rs\.?)?\s*(\d+)/i);
  const maxAmount = amountMatch ? parseInt(amountMatch[1]) : null;

  const categoryKeywords = {
    "men's clothing": ["men", "shirt", "mens", "male"],
    "women's clothing": ["women", "dress", "womens", "female"],
    "jewelery": ["jewelry", "jewelery", "ring", "necklace", "earring"],
    "electronics": ["electronics", "laptop", "phone", "hard drive", "gadget", "tech"],
  };

  const categories = [...new Set(catalog.map((p) => p.category))];
  const lowerMsg = message.toLowerCase();
  const matchedCategory = categories.find((c) => {
    const keywords = categoryKeywords[c] || [c.toLowerCase()];
    return keywords.some((kw) => lowerMsg.includes(kw));
  });

  if (!maxAmount || !matchedCategory) {
    logAudit({ actor: "agent", action: "parse_failed", detail: { maxAmount, matchedCategory } });
    return res.json({
      reply: `I couldn't understand your budget or category. Try: "buy something in electronics under 2000". Available categories: ${categories.join(", ")}`,
    });
  }

  const matches = catalog.filter((p) => p.category === matchedCategory && p.price <= maxAmount).slice(0, 3);

  if (matches.length === 0) {
    logAudit({ actor: "agent", action: "no_matching_item", detail: { matchedCategory, maxAmount } });
    return res.json({ reply: `No items found in "${matchedCategory}" under ₹${maxAmount}.`, gracefulFailure: true });
  }

  const item = matches[0];

  if (item.stock <= 0) {
    logAudit({ actor: "agent", action: "out_of_stock", detail: { item: item.title } });
    return res.json({ reply: `"${item.title}" is currently out of stock. Try another item.`, gracefulFailure: true });
  }

  const token = issueIntentMandate(maxAmount, matchedCategory);
  logAudit({ actor: "agent", action: "issue_intent_mandate", detail: { maxAmount, category: matchedCategory } });

  const result = verifyPurchase(token, item.price, item.category);
  logAudit({ actor: "verifier", action: "gate_decision", detail: result });

  if (!result.allowed) {
    return res.json({
      reply: `Payment blocked: ${result.reason}. This purchase was NOT completed.`,
      gracefulFailure: true,
      gateResult: result,
    });
  }

  const order = createMockOrder(item.price);
  logAudit({ actor: "razorpay", action: "create_order", detail: order });

  res.json({
    reply: `Found "${item.title}" for ₹${item.price}. Payment authorized and order created: ${order.id}`,
    item,
    options: matches,
    order,
  });
});

async function loadCatalog() {
  const response = await fetch("https://fakestoreapi.com/products");
  const products = await response.json();
  products.forEach(function (product) {
    product.stock = Math.floor(Math.random() * 10) + 1;
  });
  catalog = products;
}

loadCatalog().then(function () {
  app.listen(4000, function () {
    console.log("Server running on port 4000");
  });
});