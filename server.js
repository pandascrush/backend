import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import db from "./config/email.config.mjs";
import dotenv from "dotenv";
import authRoute from "./routes/auth.routes.mjs";
import categoryRoute from "./routes/Course/category.routes.mjs";
import courseRoute from "./routes/Course/course.routes.mjs";
import quizRouter from "./routes/Course/quiz.routes.mjs";
import userRouter from "./routes/User/user.routes.mjs";
import cookieParser from "cookie-parser";
import paymentRouter from "./routes/Payment/payment.routes.mjs";

dotenv.config();
const app = express();
const port = process.env.PORT;

app.use(cookieParser());
app.use(express.json());
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
app.use("/uploads", express.static("uploads"));

//richtext
let richTextContent = "";

app.post("/save", (req, res) => {
  richTextContent = req.body.content;
  res.send({ message: "Content saved successfully" });
});

app.get("/content", (req, res) => {
  res.send({ content: richTextContent });
});

// Test rout
app.get("/api/test", (req, res) => {
  res.json({ msg: "hello world" });
});

// Start server
app.listen(`${process.env.PORT}`, () => {
  console.log(`Server running on port ${port}`);
});
