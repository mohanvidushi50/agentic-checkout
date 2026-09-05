const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require("uuid");
const usedNonces = new Set();
const HARD_MAX_TRANSACTION = 5000;

function issueIntentMandate(maxAmount, category) {
    const payload = {
        maxAmount: maxAmount,
        category: category,
        nonce: uuidv4()
    };
    const token = jwt.sign(payload, "secret_key", { expiresIn: "15m" });
    return token;
}

function verifyPurchase(token, proposedAmount, proposedCategory) {
    let payload;

    try {
        payload = jwt.verify(token, "secret_key");
    } catch (err) {
        return { allowed: false, reason: "invalid_or_expired_signature: " + err.message };
    }

    if (proposedAmount > HARD_MAX_TRANSACTION) {
        return { allowed: false, reason: "exceeds_platform_hard_cap" };
    }

    if (usedNonces.has(payload.nonce)) {
        return { allowed: false, reason: "mandate_already_used" };
    }

    if (proposedAmount > payload.maxAmount) {
        return { allowed: false, reason: `amount_exceeds_limit: requested ${proposedAmount}, max ${payload.maxAmount}` };
    }

    if (proposedCategory !== payload.category) {
        return { allowed: false, reason: `category_mismatch: requested ${proposedCategory}, authorized ${payload.category}` };
    }

    usedNonces.add(payload.nonce);
    return { allowed: true };
}

module.exports = {
    issueIntentMandate,
    verifyPurchase
};