import Stripe from "stripe";
import dotenv from "dotenv";

dotenv.config();
const stripe = new Stripe(process.env.STRIPE_PRIVATE_KEY);

export const createPaymentIntent = async (req, res) => {
  try {
    const { items, success_url, cancel_url } = req.body;
    const {id} = req.params

    if (!items || items.length === 0) {
      return res.status(400).json({ error: "No items provided." });
    }

    const lineItems = items.map((item) => ({
      price_data: {
        currency: "usd",
        product_data: {
          name: item.name,
        },
        unit_amount: item.price * 100, // Convert price to cents
      },
      quantity: item.quantity,
    }));

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "payment",
      success_url: `${process.env.DOMAIN}/user/${id}/payment`, // Default success page
      cancel_url: `${process.env.DOMAIN}/user/${id}/payment`, // Default cancel page
    });

    res.json({ id: session.id });
  } catch (error) {
    console.error("Error creating Stripe session: ", error); // Log the error details
    res
      .status(500)
      .json({ error: "Internal Server Error", message: error.message });
  }
};
