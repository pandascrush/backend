// routes/authRoutes.js
import express from "express";
const router = express.Router();
import {
  checkToken,
  login,
  logout,
  registerUser,
} from "../controller/auth.controller.mjs";

router.post("/register", registerUser);
router.post("/login", login);
router.post("/logout", logout);
router.get("/protected", checkToken);

export default router;
