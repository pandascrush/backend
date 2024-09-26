import express from "express";
import { createPaymentIntent } from "../../controller/Payment/payment.controller.mjs";
const router = express.Router();

router.post("/create-payment-intent", createPaymentIntent);

export default router;
