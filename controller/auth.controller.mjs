import db from "../config/db.config.mjs";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import transporter from "../config/email.config.mjs";
const saltRounds = 10;

export const registerUser = (req, res) => {
  const { name, email, phone_no, password } = req.body;

  if (!name || !email || !phone_no || !password) {
    return res.status(400).json({ message: "All fields are required." });
  }

  // Check if email exists in User or Auth tables
  db.query(
    "SELECT email FROM user WHERE email = ?",
    [email],
    (err, userRows) => {
      if (err) {
        console.error(err);
        return res
          .status(500)
          .json({ message: "Error checking email in User table." });
      }

      if (userRows.length > 0) {
        return res
          .status(400)
          .json({ message: "Email already exists in User table." });
      }

      db.query(
        "SELECT email FROM auth WHERE email = ?",
        [email],
        (err, authRows) => {
          if (err) {
            console.error(err);
            return res
              .status(500)
              .json({ message: "Error checking email in Auth table." });
          }

          if (authRows.length > 0) {
            return res
              .status(400)
              .json({ message: "Email already exists in Auth table." });
          }

          // Hash the password
          bcrypt.hash(password, saltRounds, (err, hashedPassword) => {
            if (err) {
              console.error(err);
              return res
                .status(500)
                .json({ message: "Error hashing password." });
            }

            // Insert into User table
            db.query(
              "INSERT INTO user (first_name, email, phone_no, password) VALUES (?, ?, ?, ?)",
              [name, email, phone_no, hashedPassword],
              (err, userResult) => {
                if (err) {
                  console.error(err);
                  return res
                    .status(500)
                    .json({ message: "Error inserting into User table." });
                }

                // Get user ID
                const userId = userResult.insertId;

                // Insert into Auth table
                db.query(
                  "INSERT INTO auth (email, password, user_id,role_id) VALUES (?, ?, ?,?)",
                  [email, hashedPassword, userId, 4],
                  (err) => {
                    if (err) {
                      console.error(err);

                      // Rollback User table insert if Auth insert fails
                      db.query(
                        "DELETE FROM user WHERE email = ?",
                        [email],
                        () => {}
                      );

                      return res
                        .status(500)
                        .json({ message: "Error inserting into Auth table." });
                    }

                    // Insert into Context table
                    db.query(
                      "INSERT INTO context (contextlevel, instanceid) VALUES (?, ?)",
                      [2, userId],
                      (err, contextResult) => {
                        if (err) {
                          console.error(err);

                          // Rollback the inserts if Context insert fails
                          db.query(
                            "DELETE FROM user WHERE email = ?",
                            [email],
                            () => {}
                          );
                          db.query(
                            "DELETE FROM auth WHERE email = ?",
                            [email],
                            () => {}
                          );

                          return res.status(500).json({
                            message: "Error inserting into Context table.",
                          });
                        }

                        const contextId = contextResult.insertId;

                        // Update the User table with context_id
                        db.query(
                          "UPDATE user SET context_id = ? WHERE email = ?",
                          [contextId, email],
                          (err) => {
                            if (err) {
                              console.error(err);

                              // Rollback the inserts if User update fails
                              db.query(
                                "DELETE FROM user WHERE email = ?",
                                [email],
                                () => {}
                              );
                              db.query(
                                "DELETE FROM auth WHERE email = ?",
                                [email],
                                () => {}
                              );

                              return res.status(500).json({
                                message:
                                  "Error updating User table with context_id.",
                              });
                            }

                            // Send welcome email
                            const mailOptions = {
                              from: "sivaranji5670@gmail.com",
                              to: email,
                              subject: "Welcome to LMS",
                              text: `Hello ${name},\n\nThank you for registering with our LMS platform!\n\nBest Regards,\nLMS Team`,
                            };

                            transporter.sendMail(mailOptions, (error) => {
                              if (error) {
                                console.error(error);

                                // Rollback the inserts if email fails
                                db.query(
                                  "DELETE FROM user WHERE email = ?",
                                  [email],
                                  () => {}
                                );
                                db.query(
                                  "DELETE FROM auth WHERE email = ?",
                                  [email],
                                  () => {}
                                );

                                return res.status(500).json({
                                  message:
                                    "Registration failed. Please try again.",
                                });
                              } else {
                                res.status(201).json({
                                  message: "User registered successfully.",
                                });
                              }
                            });
                          }
                        );
                      }
                    );
                  }
                );
              }
            );
          });
        }
      );
    }
  );
};

const jwtSecret = process.env.JWT_SECRET || "your_jwt_secret_key";
export const login = (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.json({ message: "Email and password are required" });
  }

  // Check if the user exists
  db.query("SELECT * FROM auth WHERE email = ?", [email], (err, results) => {
    if (err) {
      return res.json({ message: "Database error" });
    }

    if (results.length === 0) {
      return res.json({ message: "Invalid email or password" });
    }

    const user = results[0];

    // Compare the hashed password
    bcrypt.compare(password, user.password, (err, isMatch) => {
      if (err) {
        return res.json({ message: "Error comparing passwords" });
      }

      if (!isMatch) {
        return res.json({ message: "Invalid email or password" });
      }

      // Create a JWT token
      const token = jwt.sign({ id: user.user_id }, jwtSecret, {
        expiresIn: "1h", // Token expires in 1 hour
      });

      // Set the JWT token in a cookie
      res.cookie("authToken", token, {
        httpOnly: true, // Prevent JavaScript from accessing the cookie
        maxAge: 60 * 60 * 1000, // 1 hour in milliseconds
        path: "/", // Make the cookie available across the whole site
      });

      // Log the login event in the standardlog table
      const logEvent = "login";
      const logAction = "logged";

      db.query(
        "INSERT INTO standardlog (user_id, eventname, action) VALUES (?, ?, ?)",
        [user.user_id, logEvent, logAction],
        (logErr, logResult) => {
          if (logErr) {
            console.error("Error logging event: ", logErr);
          }
        }
      );

      // Send response along with the token and user data
      res.json({ message: "login success", token, user });
    });
  });
};

export const logout = (req, res) => {
  // Extract the token from the cookie
  const token = req.cookies.authToken;

  if (!token) {
    return res.json({ message: "No authentication token found" });
  }

  // Verify the token to extract user details
  jwt.verify(token, jwtSecret, (err, decoded) => {
    if (err) {
      return res.json({ message: "Invalid token" });
    }

    const user_id = decoded.id; // Extract user_id from the decoded token

    // Log the logout event in the standardlog table
    const logEvent = "logout";
    const logAction = "logged out";

    db.query(
      "INSERT INTO standardlog (user_id, eventname, action) VALUES (?, ?, ?)",
      [user_id, logEvent, logAction],
      (logErr, logResult) => {
        if (logErr) {
          console.error("Error logging event: ", logErr);
        }

        // Clear the authentication token from the cookies
        res.clearCookie("authToken", {
          httpOnly: true, // Ensure JavaScript cannot access the cookie
          path: "/", // Clear cookie across the entire domain
          maxAge: 0, // Immediately expire the cookie
        });

        // Send a response confirming the logout
        res.json({ message: "Logged out successfully" });
      }
    );
  });
};

export const checkToken = (req, res) => {
  const token = req.cookies.authToken;

  if (!token) {
    return res.status(401).json({ message: "No token provided" });
  }

  jwt.verify(token, jwtSecret, (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    // Token is valid
    res.json({ message: "Token is valid", userId: decoded.id });
  });
};
