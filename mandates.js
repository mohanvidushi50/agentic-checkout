    const jwt=require('jsonwebtoken');
 function issueIntentMandate(maxAmount,category) 
 {
    const payload = {
        maxAmount: maxAmount,
        category: category
    };
    const token=jwt.sign(payload,"secret_key");
return token;
 }
    
module.exports = { 
    issueIntentMandate
 };

    