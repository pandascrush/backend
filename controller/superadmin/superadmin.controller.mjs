import db from "../../config/db.config.mjs";
import transporter from "../../config/email.config.mjs";
import dotenv from "dotenv";

export const getCompanyCount = (req, res) => {
  // SQL query to count the total number of company_id in the business_register table
  const countQuery =
    "SELECT COUNT(company_id) AS totalCompanies FROM business_register";

  // Execute the query
  db.query(countQuery, (error, results) => {
    if (error) {
      // Handle query error
      console.log("Error fetching company count:", error);
      return res.status(500).json({ message: "Error fetching company count." });
    }

    // Send the count as a response
    const totalCompanies = results[0].totalCompanies;
    res.json({ totalCompanies });
  });
};

export const getSubscribedUserCount = (req, res) => {
  // SQL query to count distinct user_id in the user_enrollment table
  const countQuery =
    "SELECT COUNT(DISTINCT user_id) AS subscribedUsers FROM user_enrollment";

  // Execute the query
  db.query(countQuery, (error, results) => {
    if (error) {
      // Handle query error
      console.log("Error fetching subscribed user count:", error);
      return res
        .status(500)
        .json({ message: "Error fetching subscribed user count." });
    }

    // Send the count as a response
    const subscribedUsers = results[0].subscribedUsers;
    res.json({ subscribedUsers });
  });
};

export const getCheck = (req, res) => {
  var getcheck =
    "select * from offlinetransaction where status=? and approved=?";
  db.query(getcheck, ["C", 0], (error, result) => {
    if (error) {
      console.log(error);
    } else {
      res.send(result);
    }
  });
};

export const getNeft = (req, res) => {
  var getcheck =
    "select * from offlinetransaction where status=? and approved=?";
  db.query(getcheck, ["N", 0], (error, result) => {
    if (error) {
      console.log(error);
    } else {
      res.send(result);
    }
  });
};

export const neftApproved = (req, res) => {
  var checkapproved =
    "select * from offlinetransaction where status=? and approved=?;";
  db.query(checkapproved, ["N", 1], (error, result) => {
    if (error) {
      console.log(error);
    } else {
      res.send(result);
    }
  });
};

export const checkApproved = (req, res) => {
  var checkapproved =
    "select * from offlinetransaction where status=? and approved=?;";
  db.query(checkapproved, ["C", 1], (error, result) => {
    if (error) {
      console.log(error);
    } else {
      res.send(result);
    }
  });
};

export const checkUpdate = (req, res) => {
  var { transationid, id, email, amount, quantity } = req.body;
  var upadte =
    "update offlinetransaction set transaction_id=?,approved=? where id=?";
  db.query(upadte, [transationid, 1, id], (error, result) => {
    if (error) {
      console.log(error);
    } else {
      let insertdetails =
        "insert into checkout_details(transaction_id,customer_email,customer_name,amount,description,quantity,pay_date)values(?,?,?,?,?,?,NOW())";
      db.query(
        insertdetails,
        [transationid, email, email, amount, "License", quantity],
        (error, result) => {
          if (error) {
            console.log(error);
          } else {
            let updatequantity =
              "update license set license=license + ? where company_id=(select company_id from business_register where spoc_email_id=?)";
            db.query(updatequantity, [quantity, email], (error, result) => {
              if (error) {
                console.log(error);
              } else {
                res.send({ status: "updated" });
              }
            });
          }
        }
      );
    }
  });
};

export const neftUpdate = (req, res) => {
  var { transationid, id, email, amount, quantity } = req.body;
  var upadte = "update offlinetransaction set approved=? where id=?";
  db.query(upadte, [1, id], (error, result) => {
    if (error) {
      console.log(error);
    } else {
      let insertdetails =
        "insert into checkout_details(transaction_id,customer_email,customer_name,amount,description,quantity,pay_date)values(?,?,?,?,?,?,NOW())";
      db.query(
        insertdetails,
        [transationid, email, email, amount, "License", quantity],
        (error, result) => {
          if (error) {
            console.log(error);
          } else {
            let updatequantity =
              "update license set license=license + ? where company_id=(select company_id from business_register where spoc_email_id=?)";
            db.query(updatequantity, [quantity, email], (error, result) => {
              if (error) {
                console.log(error);
              } else {
                res.send({ status: "updated" });
              }
            });
          }
        }
      );
    }
  });
};

export const monthlyProgressData = (req, res) => {
  var getrevenu =
    "WITH MonthlyRevenue AS (     SELECT          YEAR(pay_date) AS year,MONTH(pay_date) AS month,         SUM(amount) AS monthly_revenue     FROM checkout_details      GROUP BY          YEAR(pay_date),         MONTH(pay_date) ), AllMonths AS (     SELECT 1 AS month UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6      UNION SELECT 7 UNION SELECT 8 UNION SELECT 9 UNION SELECT 10 UNION SELECT 11 UNION SELECT 12 ) SELECT      am.month AS month,     COALESCE(mr.monthly_revenue, 0) AS monthly_revenue FROM      AllMonths am LEFT JOIN      MonthlyRevenue mr ON am.month = mr.month ORDER BY am.month;";
  // var getsubscribers="select * from checkout_details"
  // var getrevenu="SELECT      YEAR(pay_date) AS year,     MONTH(pay_date) AS month,     SUM(amount) AS monthly_revenue FROM      checkout_details  GROUP BY      YEAR(pay_date),     MONTH(pay_date);"
  db.query(getrevenu, (error, result) => {
    if (error) {
      console.log(error);
    } else {
      res.send(result);
    }
  });
};

export const revenueData = (req, res) => {
  var getrevenu = `SELECT 
    SUM(CASE 
        WHEN br.company_email_id IS NOT NULL OR br.spoc_email_id IS NOT NULL THEN cd.amount 
        ELSE 0 
    END) AS business_registration_amount,
    SUM(CASE 
        WHEN br.company_email_id IS NULL AND br.spoc_email_id IS NULL THEN cd.amount 
        ELSE 0 
    END) AS self_registration_amount,
    SUM(cd.amount) AS total_amount
FROM 
    checkout_details cd
LEFT JOIN 
    business_register br 
ON 
    cd.customer_email = br.company_email_id OR cd.customer_email = br.spoc_email_id;`;
  // var getsubscribers="select * from checkout_details"
  db.query(getrevenu, (error, result) => {
    if (error) {
      console.log(error);
    } else {
      res.send(result);
    }
  });
};

export const companyDetails = (req, res) => {
  var getcompany = `SELECT 
    bs.company_name, 
    bs.spoc_email_id, 
    bs.spoc_phone_number,     
    SUM(cd.quantity) AS total_licences,     
    SUM(cd.amount) AS total_amount,
    l.license -- Assuming 'license' is a field in the license table
FROM     
    business_register bs 
LEFT JOIN      
    checkout_details cd ON bs.spoc_email_id = cd.customer_email
LEFT JOIN
    license l ON bs.company_id = l.company_id -- Adjust the joining key if necessary
GROUP BY 
    bs.company_name,     
    bs.spoc_email_id, 
    bs.spoc_phone_number, 
    l.license`;
  db.query(getcompany, (error, result) => {
    if (error) {
      console.log(error);
    } else {
      res.send(result);
    }
  });
};

export const subscribersData = (req, res) => {
  const totalModules = 18; // Total number of modules

  // Query to get user details and enrollment information
  const getUsersQuery = `
      SELECT u.first_name, ue.user_id, ue.time_created AS enrollment_date
      FROM user_enrollment ue
      JOIN user u ON ue.user_id = u.user_id;
    `;

  db.query(getUsersQuery, (error, users) => {
    if (error) {
      console.error("Error fetching users:", error);
      return res.status(500).json({ message: "Error fetching users." });
    }

    const results = [];

    // For each user, check the quiz attempt data
    const checkQuizCompletion = (index) => {
      if (index >= users.length) {
        // After all users are processed, send the result
        return res.json(results);
      }

      const user = users[index];
      const userId = user.user_id;

      // Query to get completed modules from quiz_attempt with assessment_type = 2 for the user
      const quizAttemptQuery = `
          SELECT moduleid
          FROM quiz_attempt
          WHERE user_id = ? AND assessment_type = 2
          GROUP BY moduleid;
        `;

      db.query(quizAttemptQuery, [userId], (error, quizResults) => {
        if (error) {
          console.error("Error fetching quiz attempts:", error);
          return res
            .status(500)
            .json({ message: "Error fetching quiz attempts." });
        }

        // Calculate the number of completed modules
        const completedModules = quizResults.length;

        // Calculate the completion percentage
        const completionPercentage = (completedModules / totalModules) * 100;

        // Store the result for this user
        results.push({
          first_name: user.first_name,
          enrollment_date: user.enrollment_date,
          completed_modules: completedModules,
          completion_percentage: completionPercentage.toFixed(2),
        });

        // Process the next user
        checkQuizCompletion(index + 1);
      });
    };

    // Start checking quiz completion for the first user
    checkQuizCompletion(0);
  });
};

export const activeUsersData = (req, res) => {
  const totalModules = 18; // Total number of modules

  // Step 1: Query to get user details and enrollment information
  const getUsersQuery = `
      SELECT u.first_name, ue.user_id, ue.time_created AS enrollment_date
      FROM user_enrollment ue
      JOIN user u ON ue.user_id = u.user_id;
    `;

  db.query(getUsersQuery, (error, users) => {
    if (error) {
      console.error("Error fetching users:", error);
      return res.status(500).json({ message: "Error fetching users." });
    }

    const results = [];

    // Step 2: Check quiz attempts and login/logout activity for each user
    const checkUserDetails = (index) => {
      if (index >= users.length) {
        // After processing all users, return the result
        return res.json(results);
      }

      const user = users[index];
      const userId = user.user_id;

      // Query to check if the user has any login events
      const checkActivityQuery = `
          SELECT time_created, eventname
          FROM standardlog
          WHERE user_id = ? AND eventname = 'login'
          ORDER BY time_created ASC;
        `;

      db.query(checkActivityQuery, [userId], (err, logResults) => {
        if (err) {
          console.error("Error fetching login/logout activity:", err);
          return res.status(500).json({ message: "Error fetching activity." });
        }

        // If the user has no login events, mark them as inactive
        if (logResults.length === 0) {
          return checkUserDetails(index + 1);
        }

        // Now that we know the user has logged in at least once, check for inactivity
        const checkInactivityQuery = `
            SELECT time_created, eventname
            FROM standardlog
            WHERE user_id = ?
            ORDER BY time_created DESC;
          `;

        db.query(checkInactivityQuery, [userId], (error, activityResults) => {
          if (error) {
            console.error("Error fetching activity logs:", error);
            return res
              .status(500)
              .json({ message: "Error fetching activity logs." });
          }

          // Check if the user has been inactive for 5 consecutive days
          let inactive = false;
          let lastActiveDate = null;
          let consecutiveInactiveDays = 0;

          activityResults.forEach((log) => {
            const logDate = new Date(log.time_created);

            if (
              lastActiveDate &&
              (lastActiveDate - logDate) / (1000 * 60 * 60 * 24) >= 1
            ) {
              consecutiveInactiveDays++;
            } else {
              consecutiveInactiveDays = 0;
            }

            if (consecutiveInactiveDays >= 5) {
              inactive = true; // Mark user as inactive if 5 consecutive days of inactivity are found
            }

            lastActiveDate = logDate;
          });

          if (inactive) {
            // Skip the user if they are inactive
            return checkUserDetails(index + 1);
          }

          // Query to get completed modules from quiz_attempt with assessment_type = 2 for the active user
          const quizAttemptQuery = `
              SELECT moduleid
              FROM quiz_attempt
              WHERE user_id = ? AND assessment_type = 2
              GROUP BY moduleid;
            `;

          db.query(quizAttemptQuery, [userId], (error, quizResults) => {
            if (error) {
              console.error("Error fetching quiz attempts:", error);
              return res
                .status(500)
                .json({ message: "Error fetching quiz attempts." });
            }

            // Calculate the number of completed modules
            const completedModules = quizResults.length;

            // Calculate the completion percentage
            const completionPercentage =
              (completedModules / totalModules) * 100;

            // Store the result for this active user
            results.push({
              first_name: user.first_name,
              enrollment_date: user.enrollment_date,
              completed_modules: completedModules,
              completion_percentage: completionPercentage.toFixed(2),
            });

            // Process the next user
            checkUserDetails(index + 1);
          });
        });
      });
    };

    // Start processing users from the first user
    checkUserDetails(0);
  });
};

export const getEnrollmentCountForCompanyAndSelf = (req, res) => {
  const query = `
    SELECT 
      COUNT(CASE WHEN company_id IS NOT NULL THEN 1 END) AS company_enrollment_count,
      COUNT(CASE WHEN company_id IS NULL THEN 1 END) AS self_enrollment_count
    FROM user_enrollment;
  `;

  db.query(query, (error, results) => {
    if (error) {
      console.error("Error fetching enrollment counts:", error);
      return res.status(500).json({ error: "Database query failed" });
    }

    res.json({
      company_enrollment_count: results[0].company_enrollment_count,
      self_enrollment_count: results[0].self_enrollment_count,
    });
  });
};

export const activeUsersForSeperation = (req, res) => {
  const totalModules = 18; // Total number of modules

  // Step 1: Query to get user details and enrollment information
  const getUsersQuery = `
      SELECT u.first_name, ue.user_id, ue.time_created AS enrollment_date, ue.company_id
      FROM user_enrollment ue
      JOIN user u ON ue.user_id = u.user_id;
    `;

  db.query(getUsersQuery, (error, users) => {
    if (error) {
      console.error("Error fetching users:", error);
      return res.status(500).json({ message: "Error fetching users." });
    }

    const results = [];
    let companyActiveUsersCount = 0;
    let selfActiveUsersCount = 0;

    // Step 2: Check quiz attempts and login/logout activity for each user
    const checkUserDetails = (index) => {
      if (index >= users.length) {
        // After processing all users, return the result along with active users counts
        return res.json({
          results,
          company_active_users: companyActiveUsersCount,
          self_active_users: selfActiveUsersCount,
        });
      }

      const user = users[index];
      const userId = user.user_id;

      // Query to check if the user has any login events
      const checkActivityQuery = `
          SELECT time_created, eventname
          FROM standardlog
          WHERE user_id = ? AND eventname = 'login'
          ORDER BY time_created ASC;
        `;

      db.query(checkActivityQuery, [userId], (err, logResults) => {
        if (err) {
          console.error("Error fetching login/logout activity:", err);
          return res.status(500).json({ message: "Error fetching activity." });
        }

        // If the user has no login events, mark them as inactive
        if (logResults.length === 0) {
          return checkUserDetails(index + 1);
        }

        // Check for inactivity (5 consecutive days of inactivity)
        const checkInactivityQuery = `
            SELECT time_created, eventname
            FROM standardlog
            WHERE user_id = ?
            ORDER BY time_created DESC;
          `;

        db.query(checkInactivityQuery, [userId], (error, activityResults) => {
          if (error) {
            console.error("Error fetching activity logs:", error);
            return res
              .status(500)
              .json({ message: "Error fetching activity logs." });
          }

          let inactive = false;
          let lastActiveDate = null;
          let consecutiveInactiveDays = 0;

          activityResults.forEach((log) => {
            const logDate = new Date(log.time_created);

            if (
              lastActiveDate &&
              (lastActiveDate - logDate) / (1000 * 60 * 60 * 24) >= 1
            ) {
              consecutiveInactiveDays++;
            } else {
              consecutiveInactiveDays = 0;
            }

            if (consecutiveInactiveDays >= 5) {
              inactive = true;
            }

            lastActiveDate = logDate;
          });

          if (inactive) {
            return checkUserDetails(index + 1);
          }

          // Query to get completed modules from quiz_attempt with assessment_type = 2
          const quizAttemptQuery = `
              SELECT moduleid
              FROM quiz_attempt
              WHERE user_id = ? AND assessment_type = 2
              GROUP BY moduleid;
            `;

          db.query(quizAttemptQuery, [userId], (error, quizResults) => {
            if (error) {
              console.error("Error fetching quiz attempts:", error);
              return res
                .status(500)
                .json({ message: "Error fetching quiz attempts." });
            }

            // Calculate completed modules and completion percentage
            const completedModules = quizResults.length;
            const completionPercentage =
              (completedModules / totalModules) * 100;

            // Store result for the active user
            results.push({
              first_name: user.first_name,
              enrollment_date: user.enrollment_date,
              completed_modules: completedModules,
              completion_percentage: completionPercentage.toFixed(2),
            });

            // Increment the appropriate active user count
            if (user.company_id) {
              companyActiveUsersCount++;
            } else {
              selfActiveUsersCount++;
            }

            // Process the next user
            checkUserDetails(index + 1);
          });
        });
      });
    };

    // Start processing users from the first user
    checkUserDetails(0);
  });
};
