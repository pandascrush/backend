import express from "express";
import { getUserById, getUserWorkHours } from "../../controller/User/user.controller.mjs";
const router = express.Router();

router.get("/user/:id", getUserById);
router.get('/userworkhour/:id',getUserWorkHours)

export default router;