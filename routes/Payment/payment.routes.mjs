import express from "express";
import { paymentInitiate } from "../../controller/Payment/payment.controller.mjs";
const router = express.Router();

router.post("/create-payment-intent", paymentInitiate);

export default router;
