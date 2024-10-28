import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import db from "./config/db.config.mjs";
import dotenv from "dotenv";
import authRoute from "./routes/auth.routes.mjs";
import categoryRoute from "./routes/Course/category.routes.mjs";
import courseRoute from "./routes/Course/course.routes.mjs";
import quizRouter from "./routes/Course/quiz.routes.mjs";
import userRouter from "./routes/User/user.routes.mjs";
import cookieParser from "cookie-parser";
import paymentRouter from "./routes/Payment/payment.routes.mjs";
import adminRouter from "./routes/admin/admin.routes.mjs";
import superAdminRouter from './routes/superadmin/superadmin.routes.mjs'
import Stripe from "stripe";

//stripe
const stripe = new Stripe(process.env.STRIPE_PRIVATE_KEY);

dotenv.config();
const app = express();
const port = process.env.PORT;

app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
// app.use(express.urlencoded({ extended: true }));
// app.use(bodyParser.json());
app.use(
  cors({
    origin: `${process.env.DOMAIN}`, // Replace with your client URL
    credentials: true, // Allow credentials (cookies)
  })
);

app.use("/auth", authRoute);
app.use("/category", categoryRoute);
app.use("/course", courseRoute);
app.use("/quiz", quizRouter);
app.use("/user", userRouter);
app.use("/payment", paymentRouter);
app.use("/admin", adminRouter);
app.use("/superadmin",superAdminRouter)
app.use("/uploads", express.static("uploads"));

// Test rout
app.get("/api/test", (req, res) => {
  res.json({ msg: "hello world" });
});


let endpointSecret;
app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let data;
    let eventType;

    if (endpointSecret) {
      let event;

      try {
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
        data = event.data.object;
        eventType = event.type;
        console.log("Webhook verified successfully");
      } catch (err) {
        console.error(`Webhook Error: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
      }
    } else {
      data = req.body.data.object;
      eventType = req.body.type;
    }

    // Handling checkout session completion event
    if (eventType === "checkout.session.completed") {
      const transaction_id = data.id;
      try {
        // Fetch the line items from the session
        const lineItems = await stripe.checkout.sessions.listLineItems(
          transaction_id
        );
        const item = lineItems.data[0];

        // Insert transaction details into the database
        const insertDetailsQuery = `
        INSERT INTO checkout_details
        (transaction_id, customer_email, customer_name, amount, description, quantity, pay_date, pay_status)
        VALUES (?, ?, ?, ?, ?, ?, NOW(), 'completed');
      `;

        db.query(
          insertDetailsQuery,
          [
            data.id,
            data.customer_details.email,
            data.customer_details.name,
            item.amount_total / 100, // Convert from cents to dollars
            item.description,
            item.quantity,
          ],
          (error, result) => {
            if (error) {
              console.error("Error inserting transaction details: ", error);
            } else {
              console.log("Transaction details inserted successfully.");
            }
          }
        );

        // Update license quantity for the company
        const updateLicenseQuery = `
        UPDATE license 
        SET license = license + ? 
        WHERE company_id = (SELECT company_id FROM business_register WHERE spoc_email_id = ?);
      `;

        db.query(
          updateLicenseQuery,
          [item.quantity, data.customer_details.email],
          (error, result) => {
            if (error) {
              console.error("Error updating license quantity: ", error);
            } else {
              console.log("License quantity updated successfully.");
            }
          }
        );
      } catch (error) {
        console.error(
          "Error handling checkout.session.completed event: ",
          error
        );
        return res.status(500).send("Internal Server Error");
      }
    }

    // Return a 200 response to acknowledge receipt of the event
    res.status(200).send("Webhook event received").end();
  }
);

// Start server
app.listen(`${process.env.PORT}`, () => {
  console.log(`Server running on port ${port}`);
});
