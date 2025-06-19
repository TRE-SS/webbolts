// WebBolt Studios SaaS Backend API (Full Dynamic Pricing with Namecheap, Discord, and Stripe)

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const axios = require('axios');
const https = require('https');
const xml2js = require('xml2js');
const app = express();

const NAMECHEAP_API_USER = 'tartar41';
const NAMECHEAP_API_KEY = 'e058254b598c486b8914095ec1e6ead0';
const NAMECHEAP_BASE_URL = 'https://api.namecheap.com/xml.response';
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1384695993995366470/SNknkt4HFYpBZWnF0J29O_6iE8VQyrYw7vU1MSjDCAQB7oHRg2DRNaYAfdNpfT-tAjUv';
const CLIENT_IP = '100.20.92.101'; // Render outbound IP whitelisted

app.use(cors());
app.use((req, res, next) => {
  if (req.originalUrl === '/stripe-webhook') {
    next();
  } else {
    bodyParser.json()(req, res, next);
  }
});

app.post('/stripe-webhook', express.raw({ type: 'application/json' }), async (request, response) => {
  const sig = request.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(request.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.log(`Webhook signature verification failed: ${err.message}`);
    return response.sendStatus(400);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const metadata = session.metadata || {};
    const payload = {
      content: `✅ New WebBolt Purchase!\n\nCustomer Email: ${session.customer_email}\nPackage: ${metadata.packageName}\nBusiness Name: ${metadata.businessName}\nDomain: ${metadata.domainName || 'N/A'}\nPayment Intent: ${session.payment_intent}`
    };
    await axios.post(DISCORD_WEBHOOK_URL, payload);
  }
  response.send();
});

app.get('/check-domain', async (req, res) => {
  const domain = req.query.domain;
  if (!domain) return res.status(400).json({ error: 'Domain query required' });

  try {
    const checkUrl = `${NAMECHEAP_BASE_URL}?ApiUser=${NAMECHEAP_API_USER}&ApiKey=${NAMECHEAP_API_KEY}&UserName=${NAMECHEAP_API_USER}&Command=namecheap.domains.check&ClientIp=${CLIENT_IP}&DomainList=${domain}`;
    const checkResponse = await axios.get(checkUrl, { httpsAgent: new https.Agent({ rejectUnauthorized: false }) });
    const checkResult = await xml2js.parseStringPromise(checkResponse.data);
    const available = checkResult.ApiResponse.CommandResponse[0].DomainCheckResult[0].$.Available === 'true';

    if (!available) return res.json({ available: false });

    const tld = domain.split('.').pop();
    const priceUrl = `${NAMECHEAP_BASE_URL}?ApiUser=${NAMECHEAP_API_USER}&ApiKey=${NAMECHEAP_API_KEY}&UserName=${NAMECHEAP_API_USER}&Command=namecheap.users.getPricing&ProductType=DOMAIN&ProductCategory=REGISTER&ClientIp=${CLIENT_IP}`;
    const priceResponse = await axios.get(priceUrl, { httpsAgent: new https.Agent({ rejectUnauthorized: false }) });
    const priceResult = await xml2js.parseStringPromise(priceResponse.data);
    const products = priceResult.ApiResponse.CommandResponse[0].UserGetPricingResult[0].Product;

    let basePrice = null;
    for (let product of products) {
      for (let price of product.Price) {
        if (price.$.TLD === `.${tld}`) {
          basePrice = parseFloat(price.$.YourPrice);
          break;
        }
      }
    }

    if (!basePrice) return res.status(400).json({ error: 'Unable to retrieve domain pricing.' });

    let finalPrice = basePrice;
    if (basePrice < 20) finalPrice += 10;
    else if (basePrice <= 100) finalPrice *= 1.3;
    else if (basePrice <= 1000) finalPrice *= 1.2;
    else finalPrice *= 1.1;

    finalPrice = Math.ceil(finalPrice);

    res.json({ available: true, basePrice, finalPrice });
  } catch (err) {
    console.log('Namecheap Error:', err);
    res.status(500).json({ error: 'Domain check failed' });
  }
});

app.post('/create-checkout-session', async (req, res) => {
  const formData = req.body;

  try {
    const setupPrice = formData.package.setupPriceId;
    const monthlyPrice = formData.package.monthlyPriceId;

    const lineItems = [
      { price: setupPrice, quantity: 1 },
      { price: monthlyPrice, quantity: 1 }
    ];

    if (formData.purchaseDomain && formData.domainPrice && formData.domainName) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: { name: `Domain Registration: ${formData.domainName}` },
          unit_amount: formData.domainPrice * 100
        },
        quantity: 1
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: formData.email,
      line_items: lineItems,
      success_url: 'https://webboltstudios.com/success',
      cancel_url: 'https://webboltstudios.com/cancel',
      metadata: {
        packageName: formData.package.name,
        businessName: formData.businessName,
        domainName: formData.domainName || ''
      }
    });

    res.json({ url: session.url });
  } catch (err) {
    console.log('Stripe Error:', err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`WebBolt Backend running on port ${PORT}`));
