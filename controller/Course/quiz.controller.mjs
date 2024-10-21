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
  upload.none()(req, res, (err) => {
    if (err) {
      console.error("Error parsing form data", err);
      return res.json({ error: "form_data_error" });
    }

    const {
      content, // Question content
      options, // For multiple_choice/true_false
      selectedModuleId, // Module id
      parentModuleId, // Course id
      correctOption, // Correct answer for MCQ/True-False
      questionType, // Type of question
      keywords, // For descriptive type
      matches, // For match-the-following pairs
      correct,
    } = req.body;

    console.log(
      content,
      options,
      selectedModuleId,
      parentModuleId,
      correctOption,
      questionType,
      keywords,
      matches
    );

    let query;
    let queryParams;

    // Insert logic for multiple choice or true/false questions
    if (questionType === "multiple_choice" || questionType === "true/false") {
      query = `
        INSERT INTO quiz_text (text, \`option\`, correct_answer, courseid, moduleid, question_type)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      queryParams = [
        content,
        JSON.stringify(JSON.parse(options)), // Parse the options sent as JSON string
        correctOption, // Correct option
        parentModuleId, // Course ID
        selectedModuleId, // Module ID
        questionType, // Question type
      ];
    } else if (questionType === "check") {
      query = `
        INSERT INTO quiz_text (text, \`option\`, check_data, courseid, moduleid, question_type)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      queryParams = [
        content,
        JSON.stringify(JSON.parse(options)), // Parse the options sent as JSON string
        correct,
        parentModuleId, // Course ID
        selectedModuleId, // Module ID
        questionType, // Question type
      ];
    }
    // Insert logic for descriptive questions
    else if (questionType === "description") {
      query = `
        INSERT INTO quiz_text (text, \`option\`, correct_answer, courseid, moduleid, question_type)
        VALUES (?, ?, NULL, ?, ?, ?)
      `;
      queryParams = [
        content,
        JSON.stringify(JSON.parse(keywords)), // Parse the keywords sent as JSON string
        parentModuleId,
        selectedModuleId,
        "descriptive",
      ];
    }
    // Insert logic for match-the-following questions
    else if (questionType === "match_following") {
      query = `
        INSERT INTO quiz_text (text, \`option\`, correct_answer, courseid, moduleid, question_type)
        VALUES (?, ?, NULL, ?, ?, ?)
      `;
      queryParams = [
        content,
        JSON.stringify([]), // Empty array for options since matches will be inserted separately
        parentModuleId,
        selectedModuleId,
        "match",
      ];
    } else {
      return res.json({ error: "invalid_question_type" });
    }

    // Execute query to insert the main question
    db.query(query, queryParams, (err, results) => {
      if (err) {
        console.error(err);
        return res.json({ error: "db_error" });
      }

      const quizTextId = results.insertId;

      // Handle match-the-following insertion separately
      if (questionType === "match_following" && matches) {
        // Parse the matches if it's a string
        let parsedMatches = [];
        try {
          parsedMatches = JSON.parse(matches);
        } catch (parseErr) {
          return res.json({ error: "invalid_matches_format" });
        }

        // Insert each match pair
        const matchPromises = parsedMatches.map(({ leftItem, rightItem }) => {
          return new Promise((resolve, reject) => {
            const insertLeftQuery = `
              INSERT INTO match_subquestions (quiz_text_id, subquestion_text)
              VALUES (?, ?)
            `;
            db.query(
              insertLeftQuery,
              [quizTextId, leftItem],
              (err, subResult) => {
                if (err) return reject(err);

                const subquestionId = subResult.insertId;

                const insertRightQuery = `
                INSERT INTO match_options (subquestion_id, option_text, is_correct)
                VALUES (?, ?, ?)
              `;
                db.query(
                  insertRightQuery,
                  [subquestionId, rightItem, true],
                  (err) => {
                    if (err) return reject(err);
                    resolve();
                  }
                );
              }
            );
          });
        });

        // Wait for all promises to complete before sending a response
        Promise.all(matchPromises)
          .then(() => {
            res.json({ message: "quiz_added", id: quizTextId });
          })
          .catch((err) => {
            console.error(err);
            res.json({ error: "db_error" });
          });
      } else {
        // For other question types, return success response
        res.json({ message: "quiz_added", id: quizTextId });
      }
    });
  });
};

export const getQuestionByModule = (req, res) => {
  const { moduleId } = req.params;
  console.log(moduleId);

  // Step 1: Fetch questions from quiz_text based on moduleId
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
        // Step 2: Create a list of promises for match type questions
        const promises = results.map((question) => {
          if (question.question_type === 'match') {
            // Step 3: Fetch subquestions for match type questions
            return new Promise((resolve, reject) => {
              db.query(
                "SELECT * FROM match_subquestions WHERE quiz_text_id = ?",
                [question.id],
                (err, subQuestions) => {
                  if (err) {
                    return reject(err);
                  }

                  // Step 4: For each subquestion, fetch its options
                  const subQuestionPromises = subQuestions.map((subQuestion) => {
                    return new Promise((resolveOptions, rejectOptions) => {
                      db.query(
                        "SELECT * FROM match_options WHERE subquestion_id = ?",
                        [subQuestion.id],
                        (err, options) => {
                          if (err) {
                            return rejectOptions(err);
                          }
                          // Resolve with the subquestion and its options
                          resolveOptions({ ...subQuestion, options });
                        }
                      );
                    });
                  });

                  // Wait for all subquestion option queries to resolve
                  Promise.all(subQuestionPromises)
                    .then((subQuestionsWithOptions) => {
                      // Resolve with the original question and its subquestions
                      resolve({ ...question, subQuestions: subQuestionsWithOptions });
                    })
                    .catch(reject);
                }
              );
            });
          }
          // If not a match question, resolve with the question directly
          return Promise.resolve(question);
        });

        // Step 5: Wait for all questions to resolve
        Promise.all(promises)
          .then((finalResults) => {
            res.status(200).json({
              result: finalResults,
            });
          })
          .catch((err) => {
            console.error("Error fetching subquestions or options:", err);
            res.status(500).json({
              error: "Failed to fetch subquestions or options",
            });
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
          return res.json({
            error: "An error occurred while updating the question",
          });
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
    return res.json({ message: "Invalid data received." });
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
      return res.json({ message: "Error saving quiz." });
    }

    const quizId = quizResult.insertId; // Get the newly inserted quiz ID

    // Step 1: Get course_category_id from the courses table
    const courseQuery = `
      SELECT course_category_id FROM courses WHERE courseid = ?
    `;
    db.query(courseQuery, [courseId], (err, courseResult) => {
      if (err) {
        console.error("Error fetching course category:", err);
        return res.json({ message: "Error fetching course category." });
      }

      if (courseResult.length === 0) {
        return res.json({ message: "Course not found." });
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
            return res.json({ message: "Error checking context." });
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
                return res.json({ message: "Error inserting context." });
              }

              const contextId = contextInsertResult.insertId; // Get the newly inserted context ID

              // Step 4: Update the quiz table with the context ID
              const quizUpdateQuery = `
            UPDATE quiz SET context_id = ? WHERE quiz_id = ?
          `;
              db.query(quizUpdateQuery, [contextId, quizId], (err) => {
                if (err) {
                  console.error("Error updating quiz with context_id:", err);
                  return res.json({
                    message: "Error updating quiz with context ID.",
                  });
                }

                // Return success response
                res.json({
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
  const { user_id, ass_id, module } = req.params;
  const { result = [], match = [], desc = [], check = [] } = req.body; // Use 'check' for the new question type

  console.log(user_id, ass_id, result, match, desc, check);

  // Calculate the total number of questions
  const totalQuestions =
    result.length + match.length + desc.length + check.length;
  console.log("Total Questions:", totalQuestions);

  // Initialize scores
  let correctAnswers = 0;
  let descScore = 0;

  // Step 1: Calculate the score for multiple-choice questions
  const correctAnswersMC = result.filter(
    (question) => question.correct === true
  ).length;
  const mcScore =
    result.length > 0
      ? Math.round((correctAnswersMC / result.length) * 100)
      : 0;
  console.log("Multiple-Choice Score:", mcScore);
  correctAnswers += correctAnswersMC;

  // Step 2: Calculate score for match questions
  let matchScore = 0;
  let correctMatchAnswers = 0;

  const matchPromises = match.map((matchQuestion) => {
    return new Promise((resolve) => {
      let isMatchCorrect = true;

      const matchPromisesInner = matchQuestion.match_answers.map((answer) => {
        const queryGetCorrectAnswer = `
          SELECT option_text 
          FROM match_options              
          WHERE subquestion_id = ? LIMIT 1
        `;

        return new Promise((subResolve) => {
          db.query(
            queryGetCorrectAnswer,
            [answer.subquestion_id],
            (err, result) => {
              if (err) {
                console.error("Error fetching correct answer:", err);
              } else {
                const correctAnswer = result[0]?.option_text || null;
                if (answer.user_answer !== correctAnswer) {
                  isMatchCorrect = false;
                }
              }
              subResolve();
            }
          );
        });
      });

      Promise.all(matchPromisesInner).then(() => {
        if (isMatchCorrect) {
          correctMatchAnswers++;
        }
        resolve();
      });
    });
  });

  const processMatchQuestions = Promise.all(matchPromises).then(() => {
    matchScore =
      match.length > 0
        ? Math.round((correctMatchAnswers / match.length) * 100 * 0.25)
        : 0;
    console.log("Match Score:", matchScore);
    correctAnswers += correctMatchAnswers;
  });

  // Step 3: Validate descriptive questions
  const descPromises = desc.map((descQuestion) => {
    return new Promise((resolve) => {
      const queryGetKeywords = "SELECT `option` FROM quiz_text WHERE id = ?";
      db.query(queryGetKeywords, [descQuestion.question_id], (err, result) => {
        if (err) {
          console.error("Error fetching keywords:", err);
          return resolve(0);
        }

        const keywords = result[0]?.option || [];
        const userAnswer = descQuestion.user_answer;

        console.log("Descriptive Question User Answer:", userAnswer);

        const trimmedUserAnswer =
          userAnswer && typeof userAnswer === "string"
            ? userAnswer.trim().toLowerCase()
            : "";
        const isCorrect = keywords.some(
          (option) => option.keyword.trim().toLowerCase() === trimmedUserAnswer
        );

        resolve(isCorrect ? 1 : 0);
      });
    });
  });

  const processDescriptiveQuestions = Promise.all(descPromises).then(
    (descScores) => {
      const correctDescAnswers = descScores.reduce(
        (total, score) => total + score,
        0
      );
      descScore = correctDescAnswers;
      console.log("Descriptive Score:", descScore);
      correctAnswers += correctDescAnswers;
    }
  );

  // Step 4: Handle 'check' question type with array comparison
  const checkPromises = check.map((checkQuestion) => {
    return new Promise((resolve) => {
      const queryCheckAnswer = "SELECT check_data FROM quiz_text WHERE id = ?";

      db.query(queryCheckAnswer, [checkQuestion.question_id], (err, result) => {
        if (err) {
          console.error("Error fetching check_data for check:", err);
          return resolve(0); // Resolve with 0 if there's an error
        }

        let correctAnswerArray;

        try {
          // Try to parse check_data as JSON
          correctAnswerArray = JSON.parse(result[0]?.check_data || "[]");
        } catch (e) {
          // If parsing fails, treat it as a simple string
          correctAnswerArray = [result[0]?.check_data];
        }

        // Flatten both arrays to compare values without structure mismatch
        const flattenArray = (arr) => arr.flat(Infinity); // Flatten any nested arrays

        const flatCorrectAnswerArray = flattenArray(correctAnswerArray);
        const flatUserAnswerArray = flattenArray(checkQuestion.user_answers);

        console.log("Correct:", flatCorrectAnswerArray);
        console.log("User:", flatUserAnswerArray);

        // Compare the user's answers with the correct answers
        const isCorrect =
          Array.isArray(flatUserAnswerArray) &&
          flatUserAnswerArray.length === flatCorrectAnswerArray.length &&
          flatUserAnswerArray.every((answer) =>
            flatCorrectAnswerArray.includes(answer)
          );

        resolve(isCorrect ? 1 : 0); // Resolve with 1 for correct, 0 for incorrect
      });
    });
  });

  const processCheckQuestions = Promise.all(checkPromises).then(
    (checkScores) => {
      const correctCheckAnswers = checkScores.reduce(
        (total, score) => total + score,
        0
      );
      console.log("Check Type Correct Answers:", correctCheckAnswers);
      correctAnswers += correctCheckAnswers;
    }
  );

  // Wait for all scoring calculations to complete
  Promise.all([
    processMatchQuestions,
    processDescriptiveQuestions,
    processCheckQuestions,
  ]).then(finalizeScoring);

  // Step 5: Combine scores and return response
  function finalizeScoring() {
    let totalScore = 0;
    const typesCount = [
      result.length > 0,
      match.length > 0,
      desc.length > 0,
      check.length > 0,
    ].filter(Boolean).length;

    if (typesCount === 1) {
      totalScore = mcScore || matchScore || descScore || 0;
    } else if (typesCount === 2) {
      totalScore = Math.round((mcScore + matchScore + (descScore || 0)) / 2);
    } else if (typesCount >= 3) {
      totalScore = Math.round((mcScore + matchScore + descScore) / typesCount);
    }

    totalScore = isNaN(totalScore) ? 0 : totalScore;
    console.log("Total Score:", totalScore);
    console.log("Total Correct Answers:", correctAnswers);

    // Step 6: Store the attempt and log the event
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

        let newAttemptCount = 1;
        if (dbRes.length > 0) {
          newAttemptCount = dbRes[0].attempt_count + 1;
        }

        const queryInsertNewAttempt = `
        INSERT INTO quiz_attempt 
        (user_id, result, attempt_count, assessment_type, attempt_timestamp, score, moduleid, total_question, correct_question)
        VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, ?)
      `;

        db.query(
          queryInsertNewAttempt,
          [
            user_id,
            JSON.stringify(result),
            newAttemptCount,
            ass_id,
            totalScore,
            module,
            totalQuestions,
            correctAnswers,
          ],
          (insertErr) => {
            if (insertErr) {
              console.log(insertErr);
              return res.json({ error: "Error inserting new attempt" });
            }

            let eventName = ass_id == 1 ? "Pre-Assessment" : "Post-Assessment";
            const action = `${eventName} completed for module ${module}`;
            const queryInsertLog = `
          INSERT INTO standardlog (user_id, eventname, action)
          VALUES (?, ?, ?)
        `;

            db.query(queryInsertLog, [user_id, eventName, action], (logErr) => {
              if (logErr) {
                console.log(logErr);
                return res
                  .status(500)
                  .json({ error: "Error logging the event" });
              }

              const queryRetrieveAllAttempts = `
            SELECT total_question, correct_question, score, attempt_count, attempt_timestamp 
            FROM quiz_attempt
            WHERE user_id = ? AND assessment_type = ? AND moduleid = ?
          `;

              db.query(
                queryRetrieveAllAttempts,
                [user_id, ass_id, module],
                (attemptErr, attempts) => {
                  if (attemptErr) {
                    console.log(attemptErr);
                    return res
                      .status(500)
                      .json({ error: "Error retrieving attempts" });
                  }

                  return res.json({
                    message: "Quiz attempt and log saved successfully",
                    totalScore,
                    correctAnswers,
                    attempts: attempts,
                  });
                }
              );
            });
          }
        );
      }
    );
  }
}
