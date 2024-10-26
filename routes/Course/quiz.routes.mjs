import express from "express";
import {
  addQuestion,
  createQuiz,
  fetchQuizQuestions,
  getQuestion,
  getQuestionByModule,
  getQuestionsByModuleAndCourse,
  getQuestionsWithAnswers,
  getQuizType,
  saveQuizAttempt,
  updateQuestionByModule,
} from "../../controller/Course/quiz.controller.mjs";
import upload from "../../middleware/fileUpload.mjs";
const router = express.Router();

router.post("/addquestion", addQuestion);
router.get("/getquestion", getQuestion);
router.get("/getmodulequestions/:moduleId", getQuestionByModule);
router.post("/updatequestion", updateQuestionByModule);
router.get("/questions/:course/:module", getQuestionsByModuleAndCourse);
router.get("/getquiztype", getQuizType);
router.get("/fetch/:courseId/:moduleId/:quizTypeId", fetchQuizQuestions);

router.post("/createquiz", createQuiz);
router.post("/savequiz/:user_id/:ass_id/:module", saveQuizAttempt);

router.get("/getcorrectanswers/:courseid/:moduleid",getQuestionsWithAnswers)

export default router;
