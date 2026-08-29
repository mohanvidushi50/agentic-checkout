
const express = require("express");

const app = express();
let catalog = []; 

async function loadCatalog() {
  const response = await fetch("https://fakestoreapi.com/products");
  const products = await response.json();
  
  products.forEach(function(product) {
  product.stock = Math.floor(Math.random()*10) + 1;
});
catalog = products;
}

app.get("/catalog", (req, res) => {
  res.json(catalog);
});
loadCatalog().then(function() {
  app.listen(4000, function() {
    console.log("Server running on port 4000");
  });
});
