
import Stripe from 'stripe';

export async function createPaymentLink(amount, description){
  if(!process.env.STRIPE_SECRET){
    return { url: `https://example-pay.test/checkout?amount=${amount}&desc=${encodeURIComponent(description)}` };
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET);
  const product = await stripe.products.create({ name: description || 'Invoice' });
  const price = await stripe.prices.create({ unit_amount: Math.round(amount*100), currency: 'usd', product: product.id });
  const link = await stripe.paymentLinks.create({ line_items: [{ price: price.id, quantity: 1 }] });
  return { url: link.url };
}
