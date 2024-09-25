import Stripe from "stripe";
import dotenv from "dotenv";

dotenv.config();
const stripe = new Stripe(process.env.STRIPE_PRIVATE_KEY);

export const paymentInitiate = async (req, res) => {
  const { amount, currency } = req.body; // Get amount and currency from the request body

  try {
    // Create a payment intent with the provided amount and currency
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency, // Use the currency provided in the request (e.g., 'inr' for Indian Rupees)
    });

    // Return the client secret to the frontend
    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    // Handle any errors that occur
    res.status(400).send({ error: error.message });
  }
};

