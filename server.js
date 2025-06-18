// WebBolt Studios SaaS Backend API (Fully Configured)

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const app = express();

// Middleware
app.use(cors());

// Apply raw body parser only for the webhook route
app.use((req, res, next) => {
  if (req.originalUrl === '/stripe-webhook') {
    next();
  } else {
    bodyParser.json()(req, res, next);
  }
});

// Stripe Webhook Raw Body Parser
app.post('/stripe-webhook', express.raw({ type: 'application/json' }), (request, response) => {
  const sig = request.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(request.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.log(`Webhook signature verification failed: ${err.message}`);
    return response.sendStatus(400);
  }

  // Handle webhook event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    console.log('✅ Payment completed:', session);
    // This is where you would send emails or update your CRM
  }

  response.send();
});

// Main Create Checkout Session Endpoint
app.post('/create-checkout-session', async (req, res) => {
  const formData = req.body;

  try {
    let setupPrice = '';
    let monthlyPrice = '';
    let domainPrice = '';

    if (formData.package === 'Starter Bolt') {
      setupPrice = 'price_1RbCL0DGkDEuf0lG0678cvJJ';
      monthlyPrice = 'price_1RbCLgDGkDEuf0lG8l12yx9Q';
    } else if (formData.package === 'Pro Bolt') {
      setupPrice = 'price_1RbCMTDGkDEuf0lGZ4DMGYWl';
      monthlyPrice = 'price_1RbCN7DGkDEuf0lGATMMzb7Z';
    } else if (formData.package === 'Business+ Bolt') {
      setupPrice = 'price_1RbCOWDGkDEuf0lG7kifEbUv';
      monthlyPrice = 'price_1RbCPPDGkDEuf0lG6uYeeQCl';
    } else {
      return res.status(400).json({ error: 'Invalid package selected' });
    }

    // Check if domain purchase is requested
    const lineItems = [
      { price: setupPrice, quantity: 1 },
      { price: monthlyPrice, quantity: 1 }
    ];

    if (formData.purchaseDomain === true) {
      lineItems.push({ price: 'price_1RbIfGDGkDEuf0lGa0d7Tssm', quantity: 1 });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: formData.email,
      line_items: lineItems,
      success_url: 'https://webboltstudios.com/success',
      cancel_url: 'https://webboltstudios.com/cancel'
    });

    res.json({ url: session.url });
  } catch (err) {
    console.log('Stripe Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Start Server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`WebBolt Backend running on port ${PORT}`));
