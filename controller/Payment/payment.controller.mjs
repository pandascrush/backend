import Stripe from "stripe";
import dotenv from "dotenv";
import db from "../../config/db.config.mjs";

dotenv.config();
const stripe = new Stripe(process.env.STRIPE_PRIVATE_KEY);

export const createPaymentIntent = async (req, res) => {
  try {
    const { items, success_url, cancel_url } = req.body;
    const { id } = req.params;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: "No items provided." });
    }

    // Update the has_paid field in the user table
    const updateQuery = "UPDATE user SET has_paid = 1 WHERE user_id = ?";
    db.query(updateQuery, [id], (err, result) => {
      if (err) {
        console.error("Error updating user payment status: ", err);
        return res.status(500).json({ error: "Database update failed." });
      }

      // Insert into user_enrollment table with time_created
      const enrollmentQuery = `
        INSERT INTO user_enrollment (user_id, time_created) 
        VALUES (?, NOW())
      `;
      db.query(enrollmentQuery, [id], (err, enrollmentResult) => {
        if (err) {
          console.error("Error inserting into user_enrollment: ", err);
          return res.status(500).json({ error: "Database insertion failed." });
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

        // Create the Stripe session
        stripe.checkout.sessions
          .create({
            payment_method_types: ["card"],
            line_items: lineItems,
            mode: "payment",
            success_url: `${process.env.DOMAIN}/user/${id}/payment`,
            cancel_url: `${process.env.DOMAIN}/user/${id}/payment`,
          })
          .then((session) => {
            res.json({ id: session.id });
          })
          .catch((error) => {
            console.error("Error creating Stripe session: ", error);
            res
              .status(500)
              .json({ error: "Internal Server Error", message: error.message });
          });
      });
    });
  } catch (error) {
    console.error("Error: ", error);
    res
      .status(500)
      .json({ error: "Internal Server Error", message: error.message });
  }
};
