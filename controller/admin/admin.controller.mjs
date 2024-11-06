import db from "../../config/db.config.mjs";
import transporter from "../../config/email.config.mjs";
import dotenv from "dotenv";
import Stripe from "stripe";

dotenv.config();
const stripe = new Stripe(process.env.STRIPE_PRIVATE_KEY);

export const getPaidUsersCount = (req, res) => {
  // SQL query to count users with has_paid = 1, excluding user_id 1 and 2
  const query = `
      SELECT COUNT(*) AS paidUsersCount
      FROM user
      WHERE user_id NOT IN (1, 2) AND has_paid = 1
    `;

  db.query(query, (err, results) => {
    if (err) {
      console.error("Error fetching paid users count: ", err);
      return res.status(500).json({ error: "Database query failed." });
    }

    // Retrieve the count from the query result
    const { paidUsersCount } = results[0];
    res.json({ paidUsersCount });
  });
};

export const getUserStatusCounts = (req, res) => {
  const activeThreshold = 10; // days
  const currentDate = new Date();

  // Query for active users (last login/logout within 10 days) excluding user_id 1 and 2
  const activeUsersQuery = `
      SELECT user_id 
      FROM standardlog 
      WHERE eventname IN ('login', 'logout') 
      AND user_id NOT IN (1, 2)
      GROUP BY user_id
      HAVING DATEDIFF(?, MAX(time_created)) <= ?;
    `;

  // Query for inactive users (no login/logout within the last 10 days) excluding user_id 1 and 2
  const inactiveUsersQuery = `
      SELECT u.user_id 
      FROM user u
      LEFT JOIN (
        SELECT user_id 
        FROM standardlog 
        WHERE eventname IN ('login', 'logout')
        AND user_id NOT IN (1, 2)
        GROUP BY user_id
        HAVING DATEDIFF(?, MAX(time_created)) <= ?
      ) AS active_users ON u.user_id = active_users.user_id
      WHERE active_users.user_id IS NULL
      AND u.user_id NOT IN (1, 2);
    `;

  // Query for completed users (assessment_type === 2 for all 18 modules)
  const completedUsersQuery = `
      SELECT COUNT(DISTINCT user_id) AS completedUsers 
      FROM quiz_attempt 
      WHERE assessment_type = 2
      GROUP BY user_id 
      HAVING COUNT(DISTINCT moduleid) = 18;
    `;

  // Execute the queries
  db.query(
    activeUsersQuery,
    [currentDate, activeThreshold],
    (err, activeResults) => {
      if (err) {
        console.error("Error querying active users:", err);
        return res.status(500).json({ error: "Internal Server Error" });
      }

      const activeCount = activeResults.length;

      db.query(
        inactiveUsersQuery,
        [currentDate, activeThreshold],
        (err, inactiveResults) => {
          if (err) {
            console.error("Error querying inactive users:", err);
            return res.status(500).json({ error: "Internal Server Error" });
          }

          const inactiveCount = inactiveResults.length;

          db.query(completedUsersQuery, (err, completedResults) => {
            if (err) {
              console.error("Error querying completed users:", err);
              return res.status(500).json({ error: "Internal Server Error" });
            }

            const completedCount = completedResults[0]?.completedUsers || 0;

            res.json({
              activeUsers: activeCount,
              inactiveUsers: inactiveCount,
              completedUsers: completedCount,
            });
          });
        }
      );
    }
  );
};

export const countTotalUsers = (req, res) => {
  const query = `
    SELECT COUNT(*) as totalUsers 
    FROM user 
    WHERE user_id NOT IN (1, 2);
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error("Error fetching total user count:", err);
      return res.status(500).json({ error: "Internal Server Error" });
    }
    const totalUsers = results[0].totalUsers;
    res.json({ totalUsers });
  });
};

// -----------------------------------------

export const inviteLearners = (req, res) => {
  const { company_id } = req.params;
  const { emails } = req.body; // expecting a comma-separated string of emails

  if (!emails || typeof emails !== "string") {
    return res.json({ message: "Invalid email list provided." });
  }

  // Split the emails string by commas and trim whitespace
  const emailArray = emails.split(",").map((email) => email.trim());

  // Step 1: Check for existing emails
  const checkEmailQuery =
    "SELECT email FROM invite_learners WHERE company_id = ? AND email IN (?)";

  db.query(
    checkEmailQuery,
    [company_id, emailArray],
    (checkErr, existingEmailsResult) => {
      if (checkErr) {
        return res.json({
          message: "Database error while checking emails",
          error: checkErr,
        });
      }

      // Get the list of already existing emails
      const existingEmails = existingEmailsResult.map((row) => row.email);

      // Filter out the existing emails from the emailArray
      const emailsToInvite = emailArray.filter(
        (email) => !existingEmails.includes(email)
      );
      const emailCount = emailsToInvite.length; // Number of emails to invite

      // If all emails are already invited, send a response
      if (emailCount === 0) {
        return res.json({
          message: "All emails are already invited",
          existingEmails,
        });
      }

      // Start transaction
      db.beginTransaction((transactionError) => {
        if (transactionError) {
          return res.json({
            message: "Transaction error",
            error: transactionError,
          });
        }

        // Step 2: Fetch the current license and invite counts
        const getLicenseQuery =
          "SELECT license, invite FROM license WHERE company_id = ?";
        db.query(getLicenseQuery, [company_id], (err, licenseResults) => {
          if (err) {
            return db.rollback(() => {
              res.json({
                message: "Error fetching license details",
                error: err,
              });
            });
          }

          if (licenseResults.length === 0) {
            return db.rollback(() => {
              res.json({
                message: "No license record found for this company.",
              });
            });
          }

          const { license, invite } = licenseResults[0];

          // Check if there are enough licenses available
          if (license < emailCount) {
            return db.rollback(() => {
              res.json({ message: "Not enough licenses available." });
            });
          }

          // Step 3: Update license and invite counts
          const updatedLicense = license - emailCount;
          const updatedInvite = invite + emailCount;
          const updateLicenseQuery =
            "UPDATE license SET license = ?, invite = ? WHERE company_id = ?";

          db.query(
            updateLicenseQuery,
            [updatedLicense, updatedInvite, company_id],
            (updateErr) => {
              if (updateErr) {
                return db.rollback(() => {
                  res.json({
                    message: "Error updating license count",
                    error: updateErr,
                  });
                });
              }

              // Step 4: Insert new learners into invite_learners table
              const insertQuery =
                "INSERT INTO invite_learners (company_id, email) VALUES ?";
              const values = emailsToInvite.map((email) => [company_id, email]);

              db.query(insertQuery, [values], (insertErr, result) => {
                if (insertErr) {
                  return db.rollback(() => {
                    res.json({
                      message: "Error inviting learners",
                      error: insertErr,
                    });
                  });
                }

                // Step 5: Send emails to newly invited learners
                emailsToInvite.forEach((email) => {
                  sendEmail(email, company_id); // Send email to each learner
                });

                // Commit the transaction if everything is successful
                db.commit((commitErr) => {
                  if (commitErr) {
                    return db.rollback(() => {
                      res.json({
                        message: "Transaction commit error",
                        error: commitErr,
                      });
                    });
                  }

                  res.json({
                    message:
                      "Learners invited, licenses updated, and emails sent successfully",
                    invitedEmails: emailsToInvite,
                    existingEmails,
                  });
                });
              });
            }
          );
        });
      });
    }
  );
};

// Email sending function
const sendEmail = (email, company_id) => {
  const URL = `${process.env.DOMAIN}/inv_register/${company_id}`;

  const mailOptions = {
    from: "sivaranji5670@gmail.com", // sender email
    to: email, // recipient email
    subject: "Welcome to Dr Ken Spine Coach",
    html: `
      <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: auto;">
        <div style="background-color: #001040; padding: 20px; border-radius: 5px; text-align: center;">
          <h1 style="color: white;">Welcome to Dr Ken Spine Coach!</h1>
        </div>
        <div style="padding: 20px; background-color: white; border-radius: 5px;">
          <p>Dear Learner,</p>
          <p>Congratulations—you’ve just joined <strong>Dr Ken Spine Coach</strong>! By enrolling in this program, you're taking a major step towards improving your spine health knowledge and overall well-being. We’re thrilled to have you!</p>
          
          <p>Before you begin, here are a few tips to help you make the most out of this course:</p>
          <ol>
            <li><strong>Start with the first module.</strong> This course offers several modules designed to provide comprehensive training. The first module is <em>Introduction to Spine Health Basics</em>, and you can start today!</li>
            <li><strong>Set a schedule.</strong> To maximize your success, we recommend dedicating a specific time each week to focus on your learning. Consistency is key, and even 20-30 minutes a day can make a big difference!</li>
          </ol>
          <p style="margin: 20px 0;">
            <a href="${URL}" 
               style="background-color: #001040; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
               Start Your Journey
            </a>
          </p>
          <p>We’re here to support you every step of the way. Best of luck as you begin the Dr Ken Spine Coach course!</p>
          <p style="margin-top: 20px;">Best regards,</p>
          <p><strong>The Dr Ken Spine Coach Team</strong></p>
        </div>
      </div>
    `,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.log("Error sending email to:", email, error);
    } else {
      console.log("Email sent successfully to:", email, info.response);
    }
  });
};

export const companyEmailDetail = (req, res) => {
  let { bussiness_id } = req.params;
  var Dashboardsql = `SELECT spoc_email_id 
FROM business_register 
WHERE company_id = ?`;
  db.query(Dashboardsql, [bussiness_id], (error, result) => {
    if (error) {
      console.log(error);
    } else {
      res.send(result);
    }
  });
};

export const checkTransaction = (req, res) => {
  var { bussiness_id } = req.params;
  var { email, checkno, quantity, amount } = req.body;
  var insertchecktransation =
    "insert into offlinetransaction(company_id,email,checkno,quantity,amount,status,approved)values(?,?,?,?,?,?,?)";
  db.query(
    insertchecktransation,
    [bussiness_id, email, checkno, quantity, amount, "C", 0],
    (error, result) => {
      if (error) {
        console.log(error);
      } else {
        res.send({ status: "inserted" });
      }
    }
  );
};

export const neftTransaction = (req, res) => {
  var { bussiness_id } = req.params;
  var { email, transactionid, quantity, amount } = req.body;
  var insertchecktransation =
    "insert into offlinetransaction(company_id,email,transaction_id,quantity,amount,status,approved)values(?,?,?,?,?,?,?)";
  db.query(
    insertchecktransation,
    [bussiness_id, email, transactionid, quantity, amount, "N", 0],
    (error, result) => {
      if (error) {
        console.log(error);
      } else {
        res.send({ status: "inserted" });
      }
    }
  );
};

export const getLicenseCountByCompanyId = (req, res) => {
  const companyId = req.params.company_id;

  // Query to get license details from the 'license' table
  const query = "SELECT license FROM license WHERE company_id = ?";

  db.query(query, [companyId], (error, results) => {
    if (error) {
      console.error("Error fetching license:", error);
      return res.json({
        success: false,
        message: "An error occurred while fetching license details",
      });
    }

    if (results.length === 0) {
      return res.json({
        success: false,
        message: `No license found for company_id: ${companyId}`,
      });
    }

    // Send the license details in the response
    res.json({
      success: true,
      data: results[0], // Return the license details
    });
  });
};

export const countInvitedLearners = (req, res) => {
  const { company_id } = req.params;

  if (!company_id) {
    return res.status(400).json({ message: "Company ID is required." });
  }

  // SQL query to count learners based on company_id
  const query =
    "SELECT COUNT(*) AS invite_count FROM invite_learners WHERE company_id = ?";

  db.query(query, [company_id], (err, results) => {
    if (err) {
      return res.status(500).json({ message: "Database error", error: err });
    }

    // Return the count from the result
    const inviteCount = results[0].invite_count;
    res.json({ company_id, invite_count: inviteCount });
  });
};

export const enrolledUserCount = (req, res) => {
  const { company_id } = req.params;

  // Query to fetch emails from user_enrollment and invite_learners tables
  const enrollmentQuery =
    "SELECT email FROM user_enrollment WHERE company_id = ?";
  const inviteQuery = "SELECT email FROM invite_learners WHERE company_id = ?";

  // Fetch emails from user_enrollment
  db.query(enrollmentQuery, [company_id], (enrollErr, enrollmentResults) => {
    if (enrollErr) {
      console.error(enrollErr);
      return res.json({
        message: "Error fetching emails from user_enrollment table.",
      });
    }

    if (enrollmentResults.length === 0) {
      return res.json({
        message: "No emails found in user_enrollment table for this company.",
      });
    }

    // Fetch emails from invite_learners
    db.query(inviteQuery, [company_id], (inviteErr, inviteResults) => {
      if (inviteErr) {
        console.error(inviteErr);
        return res.json({
          message: "Error fetching emails from invite_learners table.",
        });
      }

      if (inviteResults.length === 0) {
        return res.json({
          message: "No emails found in invite_learners table for this company.",
        });
      }

      // Extract emails from both results
      const enrollmentEmails = enrollmentResults.map((row) => row.email);
      const inviteEmails = inviteResults.map((row) => row.email);

      // Find matching emails between the two lists
      const matchingEmails = enrollmentEmails.filter((email) =>
        inviteEmails.includes(email)
      );
      const matchingCount = matchingEmails.length;

      // Return the count of matched emails
      res.json({
        message: "Matching emails counted successfully",
        matchingCount,
      });
    });
  });
};

export const getUnenrolledInvitees = (req, res) => {
  const { company_id } = req.params;

  // Query to fetch id and email from invite_learners and only email from user_enrollment based on company_id
  const inviteQuery =
    "SELECT id, email,remainder FROM invite_learners WHERE company_id = ?";
  const enrollmentQuery =
    "SELECT email FROM user_enrollment WHERE company_id = ?";

  // Fetch ids and emails from invite_learners
  db.query(inviteQuery, [company_id], (inviteErr, inviteResults) => {
    if (inviteErr) {
      console.error(inviteErr);
      return res.json({
        message: "Error fetching emails from invite_learners table.",
      });
    }

    if (inviteResults.length === 0) {
      return res.json({
        message: "No invitees found in invite_learners table for this company.",
      });
    }

    // Fetch emails from user_enrollment
    db.query(enrollmentQuery, [company_id], (enrollErr, enrollmentResults) => {
      if (enrollErr) {
        console.error(enrollErr);
        return res.json({
          message: "Error fetching emails from user_enrollment table.",
        });
      }

      // Extract emails from both results
      const enrollmentEmails = enrollmentResults.map((row) => row.email);

      // Find invitees who are not enrolled
      const unenrolledInvitees = inviteResults.filter(
        (invite) => !enrollmentEmails.includes(invite.email)
      );

      if (unenrolledInvitees.length === 0) {
        return res.json({ message: "All invited users are already enrolled." });
      }

      // Return the list of unenrolled invitees with id and email
      res.json({
        message: "Unenrolled invitees retrieved successfully",
        unenrolledInvitees: unenrolledInvitees.map((invite) => ({
          id: invite.id,
          email: invite.email,
          remainder: invite.remainder,
        })),
      });
    });
  });
};

export const getSpocNameByCompanyId = (req, res) => {
  const { company_id } = req.params; // Extract company_id from the request parameters

  // SQL query to get the spoc_name from the business_register table
  const query =
    "SELECT spoc_name,company_email_id FROM business_register WHERE company_id = ?";

  // Execute the query
  db.query(query, [company_id], (err, result) => {
    if (err) {
      console.error("Error fetching spoc_name:", err);
      return res.status(500).json({ message: "Error fetching spoc_name." });
    }

    if (result.length === 0) {
      return res
        .status(404)
        .json({ message: "No spoc_name found for this company_id." });
    }

    // Return the spoc_name
    res.json({
      spoc_name: result[0].spoc_name,
      company_email: result[0].company_email_id,
    });
  });
};

export const remainderMail = (req, res) => {
  const { company_id } = req.params; // Extract company_id from request parameters
  const { email } = req.body; // Extract email from request body

  // URL for registration, specific to the company
  const URL = `${process.env.DOMAIN}/inv_register/${company_id}`;

  // Create the email options
  const remainderMail = {
    from: "sivaranji5670@gmail.com",
    to: email,
    subject: "Reminder to Complete Your Enrollment - Dr Ken Spine Coach",
    html: `
      <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: auto;">
        <div style="background-color: #001040; padding: 20px; border-radius: 5px; text-align: center;">
          <h1 style="color: white;">Don't Miss Out on Your Journey with Dr Ken Spine Coach!</h1>
        </div>
        <div style="padding: 20px; background-color: white; border-radius: 5px;">
          <p>Dear Learner,</p>
          <p>We noticed that you haven't completed your enrollment in <strong>Dr Ken Spine Coach</strong> yet. We don't want you to miss out on this exciting opportunity to enhance your spine health knowledge.</p>
          
          <p>Here’s why completing your enrollment matters:</p>
          <ul>
            <li><strong>Comprehensive Learning:</strong> Gain in-depth knowledge about spine health, posture, and overall wellness.</li>
            <li><strong>Expert Guidance:</strong> Learn from industry professionals and improve your well-being.</li>
            <li><strong>Flexible Learning:</strong> Study at your own pace with easy-to-follow modules.</li>
          </ul>
          
          <p style="margin: 20px 0;">
            <a href="${URL}" 
               style="background-color: #001040; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
               Complete Your Enrollment
            </a>
          </p>
          <p>We're excited to have you on board and are here to support you every step of the way.</p>
          <p style="margin-top: 20px;">Best regards,</p>
          <p><strong>The Dr Ken Spine Coach Team</strong></p>
        </div>
      </div>
    `,
  };

  // Send email using the transporter
  transporter.sendMail(remainderMail, (error, info) => {
    if (error) {
      console.log("Error sending mail:", error);
      return res.status(500).send({ message: "Error sending email." });
    } else {
      // If email sent successfully, update the remainder field
      const updateRemainderQuery =
        "UPDATE invite_learners SET remainder = remainder + 1 WHERE email = ?";

      db.query(updateRemainderQuery, [email], (err, result) => {
        if (err) {
          console.log("Error updating remainder:", err);
          return res.json({ message: "Error updating remainder count." });
        } else {
          res.json({
            status: "Reminder sent and remainder count updated.",
            message_id: info.messageId,
          });
        }
      });
    }
  });
};

export const inactiveInvites = (req, res) => {
  var { company_id } = req.params;
  var { email } = req.body;

  // Query to get company_email_id from business_register
  const getCompanyEmailQuery =
    "SELECT company_email_id FROM business_register WHERE company_id = ?";

  db.query(getCompanyEmailQuery, [company_id], (err, result) => {
    if (err) {
      console.log(err);
      return res.status(500).json({ error: "Failed to fetch company email." });
    }

    // Ensure company_email_id is retrieved
    const company_email_id = result[0]?.company_email_id;

    const Inactivemail = {
      from: "sivaranji5670@gmail.com",
      to: email,
      subject: "Inactive Enrollment Notification",
      html: `
        <div style="font-family: Arial, sans-serif; color: white; background-color: #001040; padding: 20px; border-radius: 8px; max-width: 600px; margin: 0 auto;">
          <header style="text-align: center;">
            <h2>Enrollment Status: Inactive</h2>
          </header>
          
          <p>Dear Learner,</p>
          
          <p>We hope this message finds you well. This is to inform you that your enrollment for the <strong>My Spine Coach</strong> course has been marked as inactive.</p>
          
          <p>We previously sent five reminders regarding the pending actions required to maintain your enrollment status, but unfortunately, we did not receive a response. As a result, your access has now been suspended.</p>
          
          <p>If you wish to reactivate your enrollment or have any questions regarding your status, please contact our support team at <a href="mailto:${company_email_id}" style="color: #ffcc00;">${company_email_id}</a> or reply to this email.</p>

          <p>Thank you for your understanding.</p>
          
          <p style="margin-top: 20px;">Best regards,<br>My Spine Coach Support Team</p>
        </div>
      `,
    };

    // Send the email
    transporter.sendMail(Inactivemail, (error, info) => {
      if (error) {
        return console.log(error);
      } else {
        // Update the invite status and license quantities in the database
        let updateremainder = "DELETE FROM invite_learners WHERE email = ?";
        db.query(updateremainder, [email], (error, result) => {
          if (error) {
            console.log(error);
          } else {
            let updatequantityandinvite =
              "UPDATE license SET license = license + 1, invite = invite - 1 WHERE company_id = ?";
            db.query(updatequantityandinvite, [company_id], (error, result) => {
              if (error) {
                console.log(error);
              } else {
                res.json({ status: "changed" });
              }
            });
          }
        });
      }
    });
  });
};

export const getUserStats = async (req, res) => {
  try {
    const { company_id } = req.params;
    const currentDate = new Date();
    const activeThreshold = 10; // days
    const totalModules = 18; // Total number of modules

    // Step 1: Retrieve user_ids from user_enrollment where company_id matches
    const userIdsQuery = `
        SELECT user_id 
        FROM user_enrollment
        WHERE company_id = ?;
    `;
    const [userIdsResult] = await db
      .promise()
      .query(userIdsQuery, [company_id]);
    const userIds = userIdsResult.map((row) => row.user_id);

    if (userIds.length === 0) {
      return res
        .status(404)
        .json({ message: "No users found for the given company." });
    }

    // Step 2: Queries filtered by the retrieved user_ids

    // Query to get active users with module completion count and percentage
    const activeUsersQuery = `
        SELECT u.user_id, u.first_name, u.created_at as last_activity,
               COUNT(DISTINCT qa.moduleid) as completed_modules
        FROM user u
        JOIN standardlog sl ON u.user_id = sl.user_id
        LEFT JOIN quiz_attempt qa ON u.user_id = qa.user_id AND qa.assessment_type = 2
        WHERE sl.eventname IN ('login', 'logout')
        AND u.user_id IN (?)
        GROUP BY u.user_id
        HAVING DATEDIFF(?, MAX(sl.time_created)) <= ?;
    `;

    // Query to get inactive users
    const inactiveUsersQuery = `
        SELECT u.user_id, u.first_name, u.created_at as last_activity
        FROM user u
        WHERE u.user_id IN (?)
        AND u.user_id NOT IN (
          SELECT DISTINCT user_id 
          FROM standardlog 
          WHERE eventname IN ('login', 'logout')
          AND DATEDIFF(?, time_created) <= ?
        )
        GROUP BY u.user_id;
    `;

    // Query to get completed users
    const completedUsersQuery = `
        SELECT u.user_id, u.first_name, COUNT(DISTINCT qa.moduleid) as completed_modules 
        FROM user u
        JOIN quiz_attempt qa ON u.user_id = qa.user_id
        WHERE qa.assessment_type = 2
        AND u.user_id IN (?)
        GROUP BY u.user_id 
        HAVING completed_modules = 18;
    `;

    // Query to get leaderboard data
    const leaderboardQuery = `
        SELECT u.user_id, u.first_name, COUNT(DISTINCT qa.moduleid) as modules,
               u.created_at as date
        FROM user u
        JOIN quiz_attempt qa ON u.user_id = qa.user_id
        WHERE qa.assessment_type = 2
        AND u.user_id IN (?)
        GROUP BY u.user_id
        ORDER BY modules DESC;
    `;

    // Execute the queries
    const [activeUsers] = await db
      .promise()
      .query(activeUsersQuery, [userIds, currentDate, activeThreshold]);
    const [inactiveUsers] = await db
      .promise()
      .query(inactiveUsersQuery, [userIds, currentDate, activeThreshold]);
    const [completedUsers] = await db
      .promise()
      .query(completedUsersQuery, [userIds]);
    const [leaderboardData] = await db
      .promise()
      .query(leaderboardQuery, [userIds]);

    // Format the results
    const activeData = activeUsers.map((user) => ({
      name: user.first_name,
      date: user.last_activity,
      modules: user.completed_modules,
      percent: `${((user.completed_modules / totalModules) * 100).toFixed(2)}%`,
    }));

    const inactiveData = inactiveUsers.map((user) => ({
      name: user.first_name,
      date: user.last_activity,
      modules: 0,
      percent: "0%",
    }));

    const completedData = completedUsers.map((user) => ({
      name: user.first_name,
      date: user.last_activity,
      modules: 18,
      percent: "100%",
    }));

    const leaderBoardData = leaderboardData.map((user) => ({
      name: user.first_name,
      date: user.date,
      modules: user.modules,
      percent: `${((user.modules / totalModules) * 100).toFixed(2)}%`,
    }));

    // Return the aggregated response
    res.json({
      activeData,
      inactiveData,
      completedData,
      leaderBoardData,
    });
  } catch (error) {
    console.error("Error fetching user stats: ", error);
    res
      .status(500)
      .json({ error: "Internal Server Error", message: error.message });
  }
};

export const paymentCheckOut = async (req, res) => {
  const { company_id } = req.params;
  try {
    const customer = await stripe.customers.create({
      metadata: {
        userId: req.body.id,
        quatity: req.body.quatity,
      },
    });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: req.body.items.map((item) => {
        return {
          price_data: {
            currency: "usd",
            product_data: {
              name: item.name,
            },
            unit_amount: item.price * 100,
          },
          quantity: item.quantity,
        };
      }),
      success_url: `${process.env.DOMAIN}/admindashboard/${company_id}/dashboard`,
      cancel_url: `${process.env.DOMAIN}/admindashboard/${company_id}/dashboard`,
    });

    res.json({ url: session.url });
    // res.json({url:customer.url})

    // res.send(lineItems)
  } catch (e) {
    res.status(500).json(console.log(e));
  }
};

export const paymentWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let data;
  let eventType;

  if (endpointSecret) {
    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
      data = event.data.object;
      eventType = event.type;
      console.log("Webhook verified successfully");
    } catch (err) {
      console.error(`Webhook Error: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
  } else {
    data = req.body.data.object;
    eventType = req.body.type;
  }

  // Handling checkout session completion event
  if (eventType === "checkout.session.completed") {
    const transaction_id = data.id;
    try {
      // Fetch the line items from the session
      const lineItems = await stripe.checkout.sessions.listLineItems(
        transaction_id
      );
      const item = lineItems.data[0];

      // Insert transaction details into the database
      const insertDetailsQuery = `
        INSERT INTO checkout_details
        (transaction_id, customer_email, customer_name, amount, description, quantity, pay_date, pay_status)
        VALUES (?, ?, ?, ?, ?, ?, NOW(), 'completed');
      `;

      db.query(
        insertDetailsQuery,
        [
          data.id,
          data.customer_details.email,
          data.customer_details.name,
          item.amount_total / 100, // Convert from cents to dollars
          item.description,
          item.quantity,
        ],
        (error, result) => {
          if (error) {
            console.error("Error inserting transaction details: ", error);
          } else {
            console.log("Transaction details inserted successfully.");
          }
        }
      );

      // Update license quantity for the company
      const updateLicenseQuery = `
        UPDATE license 
        SET license = license + ? 
        WHERE company_id = (SELECT company_id FROM business_register WHERE spoc_email_id = ?);
      `;

      db.query(
        updateLicenseQuery,
        [item.quantity, data.customer_details.email],
        (error, result) => {
          if (error) {
            console.error("Error updating license quantity: ", error);
          } else {
            console.log("License quantity updated successfully.");
          }
        }
      );
    } catch (error) {
      console.error("Error handling checkout.session.completed event: ", error);
      return res.status(500).send("Internal Server Error");
    }
  }

  // Return a 200 response to acknowledge receipt of the event
  res.status(200).send("Webhook event received").end();
};

export const getCoursesAndUserDetail = (req, res) => {
  const { id } = req.params;

  // First query to get the user IDs based on the company_id
  const userIdQuery = `
    SELECT DISTINCT ue.user_id
    FROM user_enrollment AS ue
    WHERE ue.company_id = ?
  `;

  db.query(userIdQuery, [id], (error, userResults) => {
    if (error) {
      console.error(error);
      return res
        .status(500)
        .json({ message: "Server error while fetching user IDs" });
    }

    // Extract user IDs from the results
    const userIds = userResults.map((user) => user.user_id);

    if (userIds.length === 0) {
      return res
        .status(404)
        .json({ message: "No users found for this company" });
    }

    const query = `
      SELECT 
        c.courseid,
        c.course_desc,
        c.coursename, 
        c.course_image, 
        c.course_start_date, 
        c.course_end_date, 
        c.created_at,
        COUNT(DISTINCT m.moduleid) AS module_count,
        COUNT(DISTINCT ue.user_id) AS enrolled_user_count,
        (SELECT COUNT(DISTINCT ue2.user_id)
         FROM user_enrollment AS ue2
         JOIN quiz_attempt AS qa ON ue2.user_id = qa.user_id 
         WHERE qa.assessment_type = 2 
         AND ue2.user_id IN (?)
         GROUP BY ue2.user_id
         HAVING COUNT(DISTINCT qa.moduleid) = 18) AS completed_user_count
      FROM 
        courses AS c
      LEFT JOIN 
        modules AS m ON c.courseid = m.courseid
      LEFT JOIN 
        user_enrollment AS ue ON ue.user_id IN (?) -- Filter by user IDs
      GROUP BY 
        c.courseid;
    `;

    // Use a single query to get course data with the filtered user IDs
    db.query(query, [userIds, userIds], (error, results) => {
      if (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
      }

      if (results.length === 0) {
        return res.status(404).json({ message: "No courses found" });
      }

      const courses = results.map((course) => ({
        courseid: course.courseid,
        coursedesc: course.course_desc,
        coursename: course.coursename,
        course_image: `${process.env.URL}${course.course_image}`,
        course_start_date: course.course_start_date,
        course_end_date: course.course_end_date,
        created_at: course.created_at,
        module_count: course.module_count,
        enrolled_user_count: course.enrolled_user_count,
        completed_user_count: course.completed_user_count, // Users who completed all 18 modules
      }));

      res.json(courses);
    });
  });
};

export const getActiveCount = (req, res) => {
  const { id } = req.params;

  // First, fetch the user_ids associated with the given company_id
  const userIdQuery = `
    SELECT user_id 
    FROM user_enrollment 
    WHERE company_id = ?;
  `;

  db.query(userIdQuery, [id], (error, userResults) => {
    if (error) {
      console.error("Error fetching user IDs:", error);
      return res.json({
        success: false,
        message: "Error fetching user IDs",
        error: error.message,
      });
    }

    // Extract user_ids from the results
    const userIds = userResults.map((user) => user.user_id);

    // If there are no users for the given company_id
    if (userIds.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No users found for this company",
        users: [],
        activeUserCount: 0,
      });
    }

    // Now, query the user_track table to get the active users
    const activeUserQuery = `
      SELECT u.*, ut.isActive
      FROM user u
      LEFT JOIN user_track ut ON u.user_id = ut.user_id
      WHERE u.user_id IN (?)
      AND u.user_id NOT IN (1, 2);
    `;

    db.query(activeUserQuery, [userIds], (err, results) => {
      if (err) {
        console.error("Error fetching users:", err);
        return res.json({
          success: false,
          message: "Error fetching users",
          error: err.message,
        });
      }

      // Count the number of active users (isActive = 1)
      const activeUserCount = results.filter(
        (user) => user.isActive === 1
      ).length;

      // Send the results and active user count as a response
      res.status(200).json({
        success: true,
        message: "All users fetched successfully",
        users: results,
        activeUserCount, // Include the overall active user count in the response
      });
    });
  });
};
