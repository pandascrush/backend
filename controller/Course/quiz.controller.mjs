import db from "../../config/db.config.mjs";
import transporter from "../../config/email.config.mjs";
import path from "path";
import upload from "../../middleware/fileUpload.mjs";

export const getQuestion = (req, res) => {
  const sql = `select * from quiz_text`;
  db.query(sql, (err, result) => {
    if (err) {
      res.json(err);
    } else {
      res.json(result);
    }
  });
};

export const addQuestion = (req, res) => {
  // Use upload.none() to handle non-file fields
  upload.none()(req, res, (err) => {
    if (err) {
      console.error("Error parsing form data", err);
      return res.status(400).json({ error: "form_data_error" });
    }

    const {
      content,
      options,
      selectedModuleId,
      parentModuleId,
      correctOption,
    } = req.body;

    // console.log(
    //   "Received Data:",
    //   content,
    //   options,
    //   selectedModuleId,
    //   parentModuleId,
    //   correctOption
    // );

    // Your existing SQL query logic
    const query =
      "INSERT INTO quiz_text (text, `option`, correct_answer, courseid, moduleid) VALUES (?, ?, ?, ?, ?)";
    db.query(
      query,
      [
        content,
        JSON.stringify(JSON.parse(options)), // Parse the string back to JSON
        correctOption,
        parentModuleId,
        selectedModuleId,
      ],
      (err, results) => {
        if (err) {
          console.log(err);
          return res.json({ error: "db_error" });
        }
        res.status(201).json({ message: "quiz_added", id: results.insertId });
      }
    );
  });
};

export const getQuestionByModule = (req, res) => {
  const { moduleId } = req.params;
  console.log(moduleId);

  db.query(
    "SELECT * FROM quiz_text WHERE moduleid = ?",
    [moduleId],
    (err, results) => {
      if (err) {
        console.error("Error fetching questions:", err);
        return res.json({
          error: "Failed to fetch questions",
        });
      }

      if (results.length > 0) {
        res.status(200).json({
          result: results,
        });
      } else {
        res.json({
          message: "No questions found for the selected module",
        });
      }
    }
  );
};

export const updateQuestionByModule = (req, res) => {
  const { moduleId, questions } = req.body;

  // console.log(questions);

  // Iterate over each question
  for (const questionId in questions) {
    const questionData = questions[questionId];
    const { text, options, correct_answer } = questionData;

    // Since options is a JSON array, we can store it directly as a JSON field in the database
    const optionsJson = JSON.stringify(options);

    // Update the question text, correct answer, and options (as JSON)
    db.query(
      "UPDATE quiz_text SET text = ?, correct_answer = ?, `option` = ? WHERE id = ?",
      [text, correct_answer, optionsJson, questionId],
      (err, result) => {
        if (err) {
          console.error("Error updating question:", err);
          return res
            .json({ error: "An error occurred while updating the question" });
        }
      }
    );
  }

  // If everything goes well, send a success response
  res.json({ message: "Questions updated successfully" });
};

export const getQuestionsByModuleAndCourse = async (req, res) => {
  const { course, module } = req.params;
  console.log("hii", module);

  if (!module || !course) {
    return res
      .status(400)
      .json({ error: "Module ID and Course ID are required" });
  }

  try {
    // Query the quiz_text table based on moduleid and courseid
    const query = `
      SELECT * 
      FROM quiz_text
      WHERE moduleid = ? AND courseid = ?
    `;

    db.query(query, [module, course], (err, result) => {
      if (err) {
        res.json(err);
      } else {
        res.status(200).json(result);
      }
    });
  } catch (error) {
    console.error("Error fetching quizzes:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

export const getQuizType = (req, res) => {
  const sql = `select * from quiz_type`;

  db.query(sql, (err, result) => {
    if (err) {
      res.json({ message: "error", err: err });
    } else {
      res.json({ result: result });
    }
  });
};

export const createQuiz = (req, res) => {
  const {
    courseId,
    categoryId, // This is moduleId (consider renaming for clarity)
    questionCount,
    questionIds,
    marks,
    sequence,
    quizTypeId, // New field for quiz type ID
  } = req.body;

  // Ensure the required data is received
  if (!courseId || !categoryId || !sequence || !quizTypeId) {
    return res.status(400).json({ message: "Invalid data received." });
  }

  // Start with inserting into the quiz table
  let quizQuery;
  let quizParams;

  if (sequence === 1) {
    // For Sequential view, store question_ids
    quizQuery = `
      INSERT INTO quiz (courseid, moduleid, max_no_of_questions, question_ids, type_of_section, quiz_type_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    quizParams = [
      courseId,
      categoryId,
      questionCount,
      JSON.stringify(questionIds),
      sequence,
      quizTypeId, // Include quiz type ID
    ];
  } else {
    // For Random view, do not store question_ids
    quizQuery = `
      INSERT INTO quiz (courseid, moduleid, max_no_of_questions, type_of_section, quiz_type_id)
      VALUES (?, ?, ?, ?, ?)
    `;
    quizParams = [courseId, categoryId, questionCount, sequence, quizTypeId]; // Include quiz type ID
  }

  // Execute the query to insert the quiz
  db.query(quizQuery, quizParams, (err, quizResult) => {
    if (err) {
      console.error("Error executing quiz query:", err);
      return res.status(500).json({ message: "Error saving quiz." });
    }

    const quizId = quizResult.insertId; // Get the newly inserted quiz ID

    // Step 1: Get course_category_id from the courses table
    const courseQuery = `
      SELECT course_category_id FROM courses WHERE courseid = ?
    `;
    db.query(courseQuery, [courseId], (err, courseResult) => {
      if (err) {
        console.error("Error fetching course category:", err);
        return res
          .status(500)
          .json({ message: "Error fetching course category." });
      }

      if (courseResult.length === 0) {
        return res.status(404).json({ message: "Course not found." });
      }

      const courseCategoryId = courseResult[0].course_category_id;

      // Step 2: Check if the context already exists in the context table
      const contextCheckQuery = `
        SELECT * FROM context WHERE contextlevel = 6 AND instanceid = ? AND path LIKE ?
      `;
      const contextPath = `${courseCategoryId}/${courseId}`; // Fix: course_category_id/courseid format only
      db.query(
        contextCheckQuery,
        [categoryId, `%${contextPath}%`],
        (err, contextResults) => {
          if (err) {
            console.error("Error checking context:", err);
            return res.status(500).json({ message: "Error checking context." });
          }

          let depth = 1; // Default depth
          if (contextResults.length > 0) {
            // If a context exists, increment the depth
            const currentDepth = contextResults[0].depth;
            depth = parseInt(currentDepth) + 1;
          }

          // Step 3: Insert a new context row if not exists
          const contextInsertQuery = `
          INSERT INTO context (contextlevel, instanceid, path, depth)
          VALUES (?, ?, ?, ?)
        `;
          db.query(
            contextInsertQuery,
            [4, categoryId, `${contextPath}`, depth],
            (err, contextInsertResult) => {
              if (err) {
                console.error("Error inserting context:", err);
                return res
                  .status(500)
                  .json({ message: "Error inserting context." });
              }

              const contextId = contextInsertResult.insertId; // Get the newly inserted context ID

              // Step 4: Update the quiz table with the context ID
              const quizUpdateQuery = `
            UPDATE quiz SET context_id = ? WHERE quiz_id = ?
          `;
              db.query(quizUpdateQuery, [contextId, quizId], (err) => {
                if (err) {
                  console.error("Error updating quiz with context_id:", err);
                  return res
                    .status(500)
                    .json({ message: "Error updating quiz with context ID." });
                }

                // Return success response
                res.status(200).json({
                  message: "Quiz and context created successfully.",
                  quizId,
                  contextId,
                });
              });
            }
          );
        }
      );
    });
  });
};

export const fetchQuizQuestions = (req, res) => {
  const { courseId, moduleId, quizTypeId } = req.params;

  // Validate input
  if (!courseId || !moduleId || !quizTypeId) {
    return res.status(400).json({ message: "Invalid parameters." });
  }

  // Define queries
  const quizQuery = `
    SELECT courseid,moduleid,max_no_of_questions,question_ids,quiz_type_id,context_id FROM quiz
    WHERE courseid = ? AND moduleid = ? AND quiz_type_id = ?
  `;

  db.query(quizQuery, [courseId, moduleId, quizTypeId], (err, quizResults) => {
    if (err) {
      console.error("Error fetching quizzes:", err);
      return res.status(500).json({ message: "Error fetching quizzes." });
    }

    if (quizResults.length === 0) {
      return res.status(404).json({ message: "No quizzes found." });
    }

    const quiz = quizResults[0];
    const { question_ids, max_no_of_questions } = quiz;

    let questionQuery;
    let params = [];

    if (question_ids && Array.isArray(question_ids)) {
      // Fetch questions using specific question IDs
      questionQuery = `
        SELECT * FROM quiz_text
        WHERE id IN (?)
      `;
      params = [question_ids];
    } else {
      // Fetch a random set of questions
      questionQuery = `
        SELECT * FROM quiz_text
        ORDER BY RAND()
        LIMIT ?
      `;
      params = [max_no_of_questions];
    }

    db.query(questionQuery, params, (err, questionResults) => {
      if (err) {
        console.error("Error fetching questions:", err);
        return res.status(500).json({ message: "Error fetching questions." });
      }

      // Add a label for quiz type
      const quizTypeLabel =
        quizTypeId === 1
          ? "Pre-Assessment Questions"
          : "Post-Assessment Questions";

      res.status(200).json({
        quiz: {
          ...quiz,
          quizTypeLabel,
        },
        questions: questionResults,
      });
    });
  });
};

export function saveQuizAttempt(req, res) {
  const { user_id, ass_id, module } = req.params; // Get user_id, ass_id, and module from req.params
  const { result } = req.body; // Get result from req.body (should be the quiz result array)

  console.log(user_id, ass_id, result);

  // Step 1: Calculate the score based on the number of correct answers
  const totalQuestions = result.length;
  const correctAnswers = result.filter(
    (question) => question.correct === true
  ).length;
  const score = Math.round((correctAnswers / totalQuestions) * 100); // Score as a percentage

  console.log(score, totalQuestions, correctAnswers);

  // Step 2: Get the previous attempt count for this user and assessment
  const queryPreviousAttemptCount = `
    SELECT attempt_count
    FROM quiz_attempt
    WHERE user_id = ? AND assessment_type = ? AND moduleid = ?
    ORDER BY attempt_timestamp DESC
    LIMIT 1
  `;

  db.query(
    queryPreviousAttemptCount,
    [user_id, ass_id, module],
    (err, dbRes) => {
      if (err) {
        console.log(err);
        return res.status(500).json({ error: "Database error" });
      }

      let newAttemptCount = 1; // Default to 1 if no previous attempts are found

      // If there are previous attempts, get the latest count and increment
      if (dbRes.length > 0) {
        const previousAttempt = dbRes[0];
        newAttemptCount = previousAttempt.attempt_count + 1;
      }

      // Step 3: Insert a new row with the new attempt count
      const queryInsertNewAttempt = `
      INSERT INTO quiz_attempt (user_id, result, attempt_count, assessment_type, attempt_timestamp, score, moduleid)
      VALUES (?, ?, ?, ?, NOW(), ?, ?)
    `;

      db.query(
        queryInsertNewAttempt,
        [
          user_id,
          JSON.stringify(result),
          newAttemptCount,
          ass_id,
          score,
          module,
        ],
        (insertErr, insertResult) => {
          if (insertErr) {
            console.log(insertErr);
            return res.json({ error: "Error inserting new attempt" });
          }

          // Step 4: After inserting, retrieve all attempts for the user and assessment_type
          const queryRetrieveAllAttempts = `
          SELECT * 
          FROM quiz_attempt
          WHERE user_id = ? AND assessment_type = ? AND moduleid = ?
          ORDER BY attempt_timestamp DESC
        `;

          db.query(
            queryRetrieveAllAttempts,
            [user_id, ass_id, module],
            (retrieveErr, allAttempts) => {
              if (retrieveErr) {
                console.log(retrieveErr);
                return res.json({ error: "Error retrieving attempts data" });
              }

              // Process each attempt to add counts for total and correct answers
              const attemptsWithCounts = allAttempts.map((attempt) => {
                let parsedResult;
                try {
                  parsedResult =
                    typeof attempt.result === "string"
                      ? JSON.parse(attempt.result)
                      : attempt.result;
                } catch (parseError) {
                  console.error("Error parsing result:", parseError);
                  parsedResult = [];
                }

                // Count the total answers and correct answers
                const totalAnswers = parsedResult.length;
                const correctAnswers = parsedResult.filter(
                  (question) => question.correct
                ).length;

                // Return the attempt with counts
                return {
                  ...attempt,
                  totalAnswers,
                  correctAnswers,
                };
              });

              // Return all the attempts in the response with counts
              return res.json({
                message: "Quiz attempt saved successfully",
                score,
                attempts: attemptsWithCounts, // Return attempts with counts
              });
            }
          );
        }
      );
    }
  );
}
