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
      SELECT u.first_name, u.last_name, u.email, u.user_id, q.moduleid, q.assessment_type, q.score
      FROM user u
      LEFT JOIN quiz_attempt q ON u.user_id = q.user_id
      WHERE u.user_id = ? AND q.assessment_type = 2
    `;

  db.query(query, [id], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Internal server error" });
    }

    if (result.length === 0) {
      return res
        .status(404)
        .json({ message: "User not found or no completed modules" });
    }

    // Define a structure for 18 modules with completed status set to false initially
    const modules = Array.from({ length: 18 }, (_, i) => ({
      module: i + 1,
      assessment_type: 2,
      completed: false,
    }));

    // Update the modules array based on quiz_attempt data (marking completed if score >= 50)
    result.forEach((attempt) => {
      const moduleIndex = attempt.moduleid - 1; // Module IDs start from 1, array indices from 0
      if (
        attempt.score >= 50 &&
        moduleIndex >= 0 &&
        moduleIndex < modules.length
      ) {
        modules[moduleIndex].completed = true;
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
      user_id: result[0].user_id,
      completion_percentage: completionPercentage.toFixed(2),
      modules: modules,
    });
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
