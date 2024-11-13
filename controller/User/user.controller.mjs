import db from "../../config/db.config.mjs";
import transporter from "../../config/email.config.mjs";
import path from "path";
import moment from "moment";

export const getUserById = (req, res) => {
  const { id } = req.params; // Extract user ID from request params

  // Check if the user ID is provided
  if (!id) {
    return res.status(400).json({ message: "User ID is required" });
  }

  // SQL query to fetch user details by ID and quiz_attempt for assessment_type = 2
  const query = `
      SELECT u.first_name, u.profile_image, u.password, u.phone_no, u.profession, u.last_name, u.email, u.user_id, 
             q.moduleid, q.assessment_type, q.score
      FROM user u
      LEFT JOIN quiz_attempt q ON u.user_id = q.user_id AND q.assessment_type = 2
      WHERE u.user_id = ?
    `;

  db.query(query, [id], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Internal server error" });
    }

    if (result.length === 0 || !result[0].user_id) {
      return res.status(404).json({ message: "User not found" });
    }

    // Define a structure for 18 modules with completed status set to false initially
    const modules = Array.from({ length: 18 }, (_, i) => ({
      module: i + 1,
      assessment_type: 2,
      completed: false,
    }));

    // Update the modules array based on quiz_attempt data (marking completed if score >= 50)
    result.forEach((attempt) => {
      if (attempt.moduleid) {
        // Ensure there is a quiz attempt
        const moduleIndex = attempt.moduleid - 1; // Module IDs start from 1, array indices from 0
        if (
          attempt.score >= 50 &&
          moduleIndex >= 0 &&
          moduleIndex < modules.length
        ) {
          modules[moduleIndex].completed = true;
        }
      }
    });

    // Calculate the completion percentage based on the 18 modules
    const completedModules = modules.filter(
      (module) => module.completed
    ).length;
    const completionPercentage = (completedModules / 18) * 100;

    // Send back the user details, modules, and completion percentage
    res.json({
      first_name: result[0].first_name,
      last_name: result[0].last_name,
      email: result[0].email,
      password: result[0].password,
      phone: result[0].phone_no,
      user_id: result[0].user_id,
      profession: result[0].profession,
      profile_image: process.env.URL + result[0].profile_image,
      completion_percentage: completionPercentage.toFixed(2),
      modules: modules,
    });
  });
};

export const updateUserProfile = (req, res) => {
  const { id } = req.params;
  const { name, email, phone, profession } = req.body;

  // Handle image upload, use a default if no file is uploaded
  const profile_image = req.file
    ? path.join("/uploads", req.file.filename)
    : "face1.jpg";

  const fieldsToUpdate = {};

  // Prepare dynamic updates based on provided fields
  if (name) fieldsToUpdate.first_name = name;
  if (email) fieldsToUpdate.email = email;
  if (phone) fieldsToUpdate.phone_no = phone;
  if (profession) fieldsToUpdate.profession = profession;
  fieldsToUpdate.profile_image = profile_image;

  const query = "UPDATE user SET ? WHERE user_id = ?";
  db.query(query, [fieldsToUpdate, id], (err, result) => {
    if (err) {
      console.error("Error updating user:", err);
      return res.json({ message: "Failed to update user." });
    }
    res.json({ message: "User updated successfully." });
  });
};

export const getUserWorkHours = (req, res) => {
  const { id } = req.params; // Extract user ID from request params

  // Check if the user ID is provided
  if (!id) {
    return res.status(400).json({ message: "User ID is required" });
  }

  // SQL query to fetch login/logout details for the user
  const query = `
    SELECT eventname, time_created 
    FROM standardlog 
    WHERE user_id = ?
    AND (eventname = 'login' OR eventname = 'logout')
    ORDER BY time_created ASC
  `;

  db.query(query, [id], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Internal server error" });
    }

    if (result.length === 0) {
      return res
        .status(404)
        .json({ message: "No login/logout records found for this user" });
    }

    let workHoursByDay = {};
    let lastLoginTime = null;

    // Iterate through the logs to calculate hours worked
    result.forEach((log) => {
      const eventTime = moment(log.time_created);

      if (log.eventname === "login") {
        // Store the login time
        lastLoginTime = eventTime;
      } else if (log.eventname === "logout" && lastLoginTime) {
        // Calculate hours worked if there was a preceding login
        const hoursWorked = eventTime.diff(lastLoginTime, "hours", true); // Get fractional hours
        const day = lastLoginTime.format("dddd"); // Get the day of the week
        const date = lastLoginTime.format("YYYY-MM-DD"); // Get the date

        // If the day already exists, accumulate the hours and ensure the date is tracked
        if (workHoursByDay[date]) {
          workHoursByDay[date].hours += hoursWorked;
        } else {
          workHoursByDay[date] = {
            day,
            hours: hoursWorked,
            date,
          };
        }

        // Reset lastLoginTime after logout
        lastLoginTime = null;
      }
    });

    // Format the response
    const response = Object.keys(workHoursByDay).map((date) => ({
      day: workHoursByDay[date].day,
      hours: parseFloat(workHoursByDay[date].hours.toFixed(2)), // Rounded to 2 decimal places
      date, // Include the date in the response
    }));

    res.json(response);
  });
};

// Controller function to fetch pre-assessment and post-assessment logs for a specific user
export function getUserAssessmentLogs(req, res) {
  const { user_id } = req.params; // Get user_id from request params

  // Step 1: Define the query to fetch pre-assessment and post-assessment logs for the user_id
  const queryFetchLogs = `
    SELECT eventname, action, time_created
    FROM standardlog
    WHERE user_id = ? 
    AND (eventname = 'Pre-assessment' OR eventname = 'Post-assessment')
    ORDER BY time_created ASC
  `;

  // Step 2: Execute the query
  db.query(queryFetchLogs, [user_id], (err, results) => {
    if (err) {
      console.log("Database error:", err);
      return res
        .status(500)
        .json({ error: "Database error while fetching logs." });
    }

    // Step 3: Group the results by date and add both pre and post assessments for each log
    const logs = [];

    results.forEach((log) => {
      // Format the date from the timestamp
      const date = new Date(log.time_created).toISOString().split("T")[0];
      const action = log.action;

      // Determine whether it's a pre-assessment or post-assessment
      if (log.eventname === "Pre-Assessment") {
        logs.push({
          date,
          pre_assessment: action, // Store the pre-assessment action
          post_assessment: "", // Empty post-assessment for now
        });
      } else if (log.eventname === "Post-Assessment") {
        logs.push({
          date,
          pre_assessment: "", // Empty pre-assessment
          post_assessment: action, // Store the post-assessment action
        });
      }
    });

    // Step 4: Return the results as JSON
    return res.json({
      message: "Assessment logs fetched successfully",
      user_id: user_id,
      logs: logs, // Return the logs as an array of objects
    });
  });
}

export const checkUserPaymentStatus = (req, res) => {
  const userId = req.params.id;

  const sql = `
    SELECT has_paid
    FROM user
    WHERE user_id = ?`;

  db.query(sql, [userId], (err, result) => {
    if (err) {
      return res.status(500).json({ error: "Database error" });
    }
    if (result.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const hasPaid = result[0].has_paid ? true : false;
    res.json({ hasPaid });
  });
};

export const getAllUsers = (req, res) => {
  // SQL query to fetch all users and their isActive status, and count the number of active users
  const sqlQuery = `
    SELECT u.*, ut.isActive, 
    (SELECT COUNT(*) FROM user u2 LEFT JOIN user_track ut2 ON u2.user_id = ut2.user_id WHERE ut2.isActive = 1 AND u2.user_id NOT IN (1, 2)) AS activeUserCount
    FROM user u
    LEFT JOIN user_track ut ON u.user_id = ut.user_id
    WHERE u.user_id NOT IN (1, 2);
  `;

  // Execute the query
  db.query(sqlQuery, (err, results) => {
    if (err) {
      console.error("Error fetching users:", err);
      return res.json({
        success: false,
        message: "Error fetching users",
        error: err.message,
      });
    }

    // Extract the active user count from the first result
    const activeUserCount = results.length > 0 ? results[0].activeUserCount : 0;

    // Remove the activeUserCount field from each row (since it only needs to be sent once)
    results.forEach((user) => delete user.activeUserCount);

    // Send the results and active user count as a response
    res.status(200).json({
      success: true,
      message: "All users fetched successfully",
      users: results,
      activeUserCount, // Include the overall active user count in the response
    });
  });
};

export const composeMessage = (req, res) => {
  const { email, subject, message, user_id } = req.body;
  console.log("email", email);

  // Validate the input
  if (!email || !subject || !message || !user_id) {
    return res.json({ message: "All fields are required." });
  }

  // Fetch the sender's first name from the user table
  const userQuery = "SELECT first_name FROM user WHERE user_id = ?"; // Adjust the table name and field name as needed
  db.query(userQuery, [user_id], (userErr, userResult) => {
    if (userErr) {
      console.error("Error fetching user data:", userErr);
      return res.json({ message: "Failed to fetch user data." });
    }

    if (userResult.length === 0) {
      return res.json({ message: "User not found." });
    }

    const senderName = userResult[0].first_name; // Get the first name

    // Split the email variable by commas to handle multiple user IDs
    const userIds = email.split(",").map((id) => id.trim());

    // Fetch the email addresses for the provided user IDs
    const emailQuery = `SELECT email FROM auth WHERE role_id IN (${userIds.join(
      ","
    )})`;
    db.query(emailQuery, (emailErr, emailResult) => {
      if (emailErr) {
        console.error("Error fetching recipient emails:", emailErr);
        return res.json({ message: "Failed to fetch recipient emails." });
      }

      if (emailResult.length === 0) {
        return res.json({ message: "No valid email addresses found." });
      }

      // Prepare the list of emails to send messages to
      const emailList = emailResult.map((row) => row.email);
      console.log("emaillist", emailList);

      // Prepare to store any email sending/storing errors
      let emailErrors = [];
      let successfulSends = 0;

      // Send emails to each recipient and store each in the database
      emailList.forEach((recipientEmail, index) => {
        const mailOptions = {
          from: "sivaranji5670@gmail.com", // Your sender email
          to: recipientEmail,
          subject: `Support Query: ${subject}`, // Subject with a support prefix
          html: `
            <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
              <header style="text-align: center; padding: 10px 0;">
                <h2 style="color: #0056b3;">Support Team - Dr Ken Spin Coach</h2>
              </header>
              
              <p>Thank you for reaching out to us. We have received your query and our support team will respond to you as soon as possible.</p>
              
              <h3 style="color: #333;">Your Query:</h3>
              <p style="background-color: #f9f9f9; padding: 10px; border-left: 4px solid #0056b3; color: #555;">
                ${message}
              </p>
        
              <p>If you have additional information to share, please reply directly to this email, and our team will include it in your support case.</p>
            </div>
          `,
        };

        // Send the email
        transporter.sendMail(mailOptions, (err, info) => {
          if (err) {
            console.error(`Error sending email to ${recipientEmail}:`, err);
            emailErrors.push(recipientEmail);
          } else {
            // Store the message in the database for each recipient
            const query =
              "INSERT INTO user_msg_compose (sender_name, subject, receiver_email, timestamp, user_id) VALUES (?, ?, ?, ?, ?)";
            db.query(
              query,
              [senderName, subject, recipientEmail, new Date(), user_id],
              (dbErr, dbResult) => {
                if (dbErr) {
                  console.error(
                    `Error storing message for ${recipientEmail}:`,
                    dbErr
                  );
                  emailErrors.push(recipientEmail);
                } else {
                  successfulSends++;
                }

                // After processing all emails, send the final response
                if (index === emailList.length - 1) {
                  if (emailErrors.length > 0) {
                    return res.json({
                      message: `Message sent to some recipients, but failed for: ${emailErrors.join(
                        ", "
                      )}`,
                    });
                  } else {
                    return res.json({
                      message: `Message sent and stored successfully to all recipients!`,
                    });
                  }
                }
              }
            );
          }
        });
      });
    });
  });
};

export const getAllMessage = (req, res) => {
  const { id } = req.params;
  console.log(id);
  const sql = `select * from user_msg_compose where user_id =?`;

  db.query(sql, [id], (err, result) => {
    if (err) {
      res.json({ err: err });
    } else {
      console.log(result);
      res.json({ msg: result });
    }
  });
};

export const userPaymentVerification = (req, res) => {
  const { id } = req.params;

  // Correct SQL query to fetch has_paid based on user_id
  const sql = `SELECT has_paid FROM user WHERE user_id = ?`;

  db.query(sql, [id], (err, result) => {
    if (err) {
      return res.json({ error: err });
    }

    // Assuming result is an array and has_paid is the first value
    if (result.length > 0) {
      const hasPaid = result[0].has_paid === 1; // Convert 1 to true and 0 to false
      res.json({ hasPaid });
    } else {
      res.json({ hasPaid: false }); // Default to false if no result
    }
  });
};

export const getModuleCompletion = (req, res) => {
  const userId = req.params.userId; // Get user_id from request parameters

  const query = `
    SELECT 
        m.moduleid,
        m.modulename,
        MAX(CASE 
            WHEN qa.assessment_type = 1 THEN 50
            WHEN qa.assessment_type = 2 THEN 100
            ELSE 0
        END) AS completion_percentage
    FROM 
        quiz_attempt AS qa
    JOIN 
        modules AS m ON qa.moduleid = m.moduleid
    WHERE 
        qa.user_id = ?
    GROUP BY 
        m.moduleid, m.modulename
    ORDER BY 
        m.moduleid ASC;  -- Ordering by moduleid in ascending order
  `;

  db.query(query, [userId], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Database query failed" });
    }

    if (results.length === 0) {
      return res
        .status(404)
        .json({ message: "No modules found for this user" });
    }

    res.status(200).json(results);
  });
};

export const getModuleCompletionForCertificate = (req, res) => {
  const userId = req.params.user_id;

  const query = `
    SELECT 
        m.moduleid,
        m.modulename,
        MAX(CASE 
            WHEN qa.assessment_type = 1 THEN 50
            WHEN qa.assessment_type = 2 THEN 100
            ELSE 0
        END) AS completion_percentage
    FROM 
        quiz_attempt AS qa
    JOIN 
        modules AS m ON qa.moduleid = m.moduleid
    WHERE 
        qa.user_id = ?
    GROUP BY 
        m.moduleid, m.modulename
    ORDER BY 
        m.moduleid ASC;
  `;

  db.query(query, [userId], (error, results) => {
    if (error) {
      console.error("Error fetching module completion status:", error);
      return res.json({ error: "Internal server error" });
    }

    // Count how many modules are completed (100% completion)
    const completedModules = results.filter(
      (module) => module.completion_percentage === 100
    ).length;

    const totalModules = 18; // total required modules for certification

    if (completedModules >= totalModules) {
      res.json({
        message: "All modules completed. Certificate available for download.",
      });
    } else {
      res.json({
        short : "you need to complete",
        message: `You need to complete ${
          totalModules - completedModules
        } more module(s) to download the certificate.`,
        remainingModules: totalModules - completedModules,
      });
    }
  });
};
