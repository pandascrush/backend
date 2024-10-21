// routes/authRoutes.js
import express from "express";
const router = express.Router();
import {
  checkToken,
  invitedRegisterUser,
  login,
  logout,
  registerBusiness,
  registerUser,
} from "../controller/auth.controller.mjs";

router.post("/register", registerUser);
router.post("/login", login);
router.post("/logout", logout);
router.get("/protected", checkToken);

router.post("/invited_register/:id",invitedRegisterUser)
router.post("/business_register", registerBusiness);

export default router;
