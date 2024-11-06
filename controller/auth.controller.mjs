import db from "../config/db.config.mjs";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import transporter from "../config/email.config.mjs";
import path from "path";
const saltRounds = 10;

export const registerBusiness = async (req, res) => {
  const {
    company_name,
    company_email_id,
    country,
    zipcode,
    company_phone_number,
    spoc_name,
    spoc_email_id,
    spoc_phone_number,
    company_size,
    company_type,
    password, // User's raw password
  } = req.body;

  const saltRounds = 10;

  try {
    const domain = company_email_id.split("@")[1]; // Extract domain from email

    // Query to check if any company with the same domain already exists
    const checkDomainQuery = `SELECT company_email_id FROM business_register WHERE company_email_id LIKE ?`;
    db.query(
      checkDomainQuery,
      [`%${domain}`],
      async (err, existingCompanies) => {
        if (err) {
          console.error("Error checking company domain:", err);
          return res.json({ message: "Error checking company domain." });
        }

        // If any company with the same domain exists, return an error
        if (existingCompanies.length > 0) {
          return res.json({
            message: "Company email domain is already registered.",
          });
        }

        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Start transaction
        db.beginTransaction((err) => {
          if (err) {
            return res.json({ message: "Error starting database transaction" });
          }

          // Insert the business information into the business_register table
          const insertBusinessQuery = `
          INSERT INTO business_register 
          (company_name, company_email_id, country, zipcode, company_phone_number, spoc_name, spoc_email_id, spoc_phone_number, company_size, company_type, password)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

          db.query(
            insertBusinessQuery,
            [
              company_name,
              company_email_id,
              country,
              zipcode,
              company_phone_number,
              spoc_name,
              spoc_email_id,
              spoc_phone_number,
              company_size,
              company_type,
              hashedPassword, // Store hashed password
            ],
            (err, result) => {
              if (err) {
                return db.rollback(() => {
                  console.error(err);
                  res.json({ message: "Error registering business" });
                });
              }

              const companyId = result.insertId; // Get the inserted company_id

              // Now insert into the auth table for the SPOC
              const insertAuthQuery = `INSERT INTO auth (company_id, email, password, role_id) VALUES (?, ?, ?, ?)`;
              db.query(
                insertAuthQuery,
                [companyId, spoc_email_id, hashedPassword, 5], // role_id is 5 for SPOC
                (err, authResult) => {
                  if (err) {
                    return db.rollback(() => {
                      console.error(err);
                      res.json({
                        message: "Error registering SPOC in auth table",
                      });
                    });
                  }

                  // Insert into the license table
                  const insertLicenseQuery = `INSERT INTO license (company_id, license, invite, enrolled) VALUES (?, ?, ?, ?)`;
                  db.query(
                    insertLicenseQuery,
                    [companyId, 0, 0, 0], // Set license, invite, and enrolled to 0
                    (err, licenseResult) => {
                      if (err) {
                        return db.rollback(() => {
                          console.error(err);
                          res.json({
                            message: "Error inserting into license table",
                          });
                        });
                      }

                      // Insert into the context table after inserting into auth
                      const insertContextQuery = `INSERT INTO context (contextlevel, instanceid) VALUES (?, ?)`;
                      db.query(
                        insertContextQuery,
                        [7, companyId], // contextlevel = 7, instanceid = companyId
                        (err, contextResult) => {
                          if (err) {
                            return db.rollback(() => {
                              console.error(err);
                              res.json({
                                message: "Error inserting into context table",
                              });
                            });
                          }

                          const contextId = contextResult.insertId; // Get the inserted context_id

                          // Update the business_register table with the context_id
                          const updateBusinessQuery = `UPDATE business_register SET context_id = ? WHERE company_id = ?`;
                          db.query(
                            updateBusinessQuery,
                            [contextId, companyId],
                            (err, updateResult) => {
                              if (err) {
                                return db.rollback(() => {
                                  console.error(err);
                                  res.json({
                                    message:
                                      "Error updating business_register with context_id",
                                  });
                                });
                              }

                              // Commit the transaction if all inserts succeed
                              db.commit(async (err) => {
                                if (err) {
                                  return db.rollback(() => {
                                    console.error(err);
                                    res.json({
                                      message: "Error committing transaction",
                                    });
                                  });
                                }

                                // Send confirmation email to SPOC
                                const mailData = {
                                  from: "sivaranji5670@gmail.com",
                                  to: spoc_email_id,
                                  subject: "Account Registration Successful",
                                  text: `Dear ${spoc_name}, Your registration was successful. Username: ${spoc_email_id}, Password: ${password}`,
                                  html: `
                                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; background-color: #001040; border-radius: 10px; color: white;">
                                      <h2 style="text-align: center; color: #4CAF50;">Welcome!</h2>
                                      <p>Dear ${spoc_name},</p>
                                      <p>Thank you for registering with us. Below are your account details:</p>
                                      
                                      <div style="padding: 15px; border: 1px solid #4CAF50; border-radius: 8px; margin-top: 10px; background-color: #001a66;">
                                        <p><strong>Username:</strong> ${spoc_email_id}</p>
                                        <p><strong>Password:</strong> ${password}</p>
                                        <p><strong>Login URL:</strong> <a href="${process.env.DOMAIN}" style="color: #4CAF50; font-weight: bold;">https://yourwebsite.com/login</a></p>
                                      </div>
                                      
                                      <p style="margin-top: 20px;">To get started, simply log in using the link above and begin exploring our features!</p>
                                  
                                      <div style="border-top: 1px solid #4CAF50; margin-top: 20px; padding-top: 10px;">
                                        <p style="font-size: 12px; color: #ffffff;">If you did not register for this account, please ignore this email or contact our support team at support@yourwebsite.com.</p>
                                        <p style="font-size: 12px; color: #ffffff;">Best Regards,<br>Support Team</p>
                                      </div>
                                    </div>
                                  `,
                                };

                                // Send email
                                transporter.sendMail(
                                  mailData,
                                  (error, info) => {
                                    if (error) {
                                      console.error(
                                        "Error sending email:",
                                        error
                                      );
                                    } else {
                                      console.log("Email sent:", info.response);
                                    }
                                  }
                                );

                                res.json({
                                  message: "Business registered successfully",
                                  business_id: companyId,
                                  spoc_id: authResult.insertId,
                                  context_id: contextId,
                                });
                              });
                            }
                          );
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
  } catch (error) {
    console.error("Error processing request:", error);
    res.status(500).json({ message: "Error processing registration" });
  }
};

export const registerUser = (req, res) => {
  const { fullname, email, phone_no, qualification, jobStatus, password } =
    req.body;

  if (!fullname || !email || !phone_no || !password) {
    return res.json({ message: "All fields are required." });
  }

  const defaultProfileImage = path.join("/uploads", "face1.jpg");

  // Check if email exists in User or Auth tables
  db.query(
    "SELECT email FROM user WHERE email = ?",
    [email],
    (err, userRows) => {
      if (err) {
        console.error(err);
        return res.json({ message: "Error checking email in User table." });
      }

      if (userRows.length > 0) {
        return res.json({ message: "Email already exists in User table." });
      }

      db.query(
        "SELECT email FROM auth WHERE email = ?",
        [email],
        (err, authRows) => {
          if (err) {
            console.error(err);
            return res.json({ message: "Error checking email in Auth table." });
          }

          if (authRows.length > 0) {
            return res.json({ message: "Email already exists in Auth table." });
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
              "INSERT INTO user (first_name, email, phone_no, password, qualification, profession,profile_image) VALUES (?,?, ?, ?, ?,?,?)",
              [
                fullname,
                email,
                phone_no,
                hashedPassword,
                qualification,
                jobStatus,
                defaultProfileImage,
              ],
              (err, userResult) => {
                if (err) {
                  console.error(err);
                  return res.json({
                    message: "Error inserting into User table.",
                  });
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

                      return res.json({
                        message: "Error inserting into Auth table.",
                      });
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

                          return res.json({
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

                              return res.json({
                                message:
                                  "Error updating User table with context_id.",
                              });
                            }

                            // Send welcome email
                            const mailOptions = {
                              from: "sivaranji5670@gmail.com",
                              to: email,
                              subject: "Welcome to LMS - Dr Ken Spine Coach",
                              text: `Hello ${fullname}, Thank you for registering with our LMS platform for the course "Dr Ken Spine Coach". We’re excited to have you with us! Best Regards, LMS Team`,
                              html: `
                                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; background-color: #001040; border-radius: 10px; color: white;">
                                  <h2 style="text-align: center; color: white;">Welcome to Dr Ken Spine Coach!</h2>
                                  
                                  <p>Hello ${fullname},</p>
                                  <p>Thank you for joining us at the LMS platform! We’re thrilled to have you on board for the <strong style="color: white;">Dr Ken Spine Coach</strong> course.</p>
                            
                                  <div style="padding: 15px; border: 1px solid #4CAF50; border-radius: 8px; margin-top: 10px; background-color: #001040;">
                                    <h3 style="color: #4CAF50; margin-bottom: 10px;">Getting Started</h3>
                                    <p style="margin: 0; color: white;">To begin your journey, please log in and explore your course materials:</p>
                                    <p style="margin: 0;"><a href="${process.env.DOMAIN}" style="color: #4CAF50; font-weight: bold;">Go to LMS Login</a></p>
                                  </div>
                            
                                  <p style="margin-top: 20px; color: white;">Once logged in, you’ll have access to all the resources and support you need to excel in the course.</p>
                                  
                                  <p style="color: white;">If you have any questions or need assistance, feel free to reach out to our support team at <a href="mailto:support@yourwebsite.com" style="color: #4CAF50;">support@yourwebsite.com</a>.</p>
                            
                                  <div style="border-top: 1px solid #4CAF50; margin-top: 20px; padding-top: 10px;">
                                    <p style="font-size: 12px; color: white;">Best Regards,<br>LMS Team</p>
                                  </div>
                                </div>
                              `,
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

                                return res.json({
                                  message:
                                    "Registration failed. Please try again.",
                                });
                              } else {
                                res.json({
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

export const invitedRegisterUser = (req, res) => {
  const { fullname, email, phone_no, qualification, jobStatus, password } =
    req.body;

  const { id } = req.params;

  if (!fullname || !email || !phone_no || !password) {
    return res.json({ message: "All fields are required." });
  }

  const defaultProfileImage = path.join("/uploads", "face1.jpg");

  // Check if email exists in User or Auth tables
  db.query(
    "SELECT email FROM user WHERE email = ?",
    [email],
    (err, userRows) => {
      if (err) {
        console.error(err);
        return res.json({ message: "Error checking email in User table." });
      }

      if (userRows.length > 0) {
        return res.json({ message: "Email already exists in User table." });
      }

      db.query(
        "SELECT email FROM auth WHERE email = ?",
        [email],
        (err, authRows) => {
          if (err) {
            console.error(err);
            return res.json({ message: "Error checking email in Auth table." });
          }

          if (authRows.length > 0) {
            return res.json({ message: "Email already exists in Auth table." });
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
              "INSERT INTO user (first_name, email, phone_no, password, qualification, profession, has_paid,profile_image) VALUES (?, ?, ?, ?,?,?,?,?)",
              [
                fullname,
                email,
                phone_no,
                hashedPassword,
                qualification,
                jobStatus,
                1,
                defaultProfileImage,
              ],
              (err, userResult) => {
                if (err) {
                  console.error(err);
                  return res.json({
                    message: "Error inserting into User table.",
                  });
                }

                // Get user ID
                const userId = userResult.insertId;

                // Insert into Auth table
                db.query(
                  "INSERT INTO auth (email, password, user_id, role_id) VALUES (?, ?, ?, ?)",
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

                      return res.json({
                        message: "Error inserting into Auth table.",
                      });
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

                          return res.json({
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

                              return res.json({
                                message:
                                  "Error updating User table with context_id.",
                              });
                            }

                            // Insert into user_enrollment table
                            const timeCreated = new Date();
                            db.query(
                              "INSERT INTO user_enrollment (user_id, time_created,company_id,email) VALUES (?, ?, ?, ?)",
                              [userId, timeCreated, id, email],
                              (enrollErr) => {
                                if (enrollErr) {
                                  console.error(enrollErr);

                                  // Rollback if user_enrollment insert fails
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
                                  db.query(
                                    "DELETE FROM context WHERE instanceid = ?",
                                    [userId],
                                    () => {}
                                  );

                                  return res.json({
                                    message:
                                      "Error inserting into user_enrollment table.",
                                  });
                                }

                                // Send welcome email
                                const mailOptions = {
                                  from: "sivaranji5670@gmail.com",
                                  to: email,
                                  subject:
                                    "Welcome to LMS - Dr Ken Spine Coach",
                                  text: `Hello ${fullname}, Thank you for registering with our LMS platform for the course "Dr Ken Spine Coach". We’re excited to have you with us! Best Regards, LMS Team`,
                                  html: `
                                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; background-color: #001040; border-radius: 10px; color: white;">
                                      <h2 style="text-align: center; color: #4CAF50;">Welcome to Dr Ken Spine Coach!</h2>
                                      
                                      <p>Hello ${fullname},</p>
                                      <p>Thank you for joining us at the LMS platform! We’re thrilled to have you on board for the <strong>Dr Ken Spine Coach</strong> course.</p>
                                
                                      <div style="padding: 15px; border: 1px solid #4CAF50; border-radius: 8px; margin-top: 10px; background-color: #001a66;">
                                        <h3 style="color: #4CAF50; margin-bottom: 10px;">Getting Started</h3>
                                        <p style="margin: 0;">To begin your journey, please log in and explore your course materials:</p>
                                        <p style="margin: 0;"><a href="${process.env.DOMAIN}" style="color: #4CAF50; font-weight: bold;">Go to LMS Login</a></p>
                                      </div>
                                
                                      <p style="margin-top: 20px;">Once logged in, you’ll have access to all the resources and support you need to excel in the course.</p>
                                      
                                
                                      <div style="border-top: 1px solid #4CAF50; margin-top: 20px; padding-top: 10px;">
                                        <p style="font-size: 12px; color: #ffffff;">Best Regards,<br>LMS Team</p>
                                      </div>
                                    </div>
                                  `,
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
                                    db.query(
                                      "DELETE FROM context WHERE instanceid = ?",
                                      [userId],
                                      () => {}
                                    );
                                    db.query(
                                      "DELETE FROM user_enrollment WHERE user_id = ?",
                                      [userId],
                                      () => {}
                                    );

                                    return res.json({
                                      message:
                                        "Registration failed. Please try again.",
                                    });
                                  } else {
                                    res.json({
                                      message:
                                        "User registered and enrolled successfully.",
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

      // Track user in user_track table
      db.query(
        "SELECT * FROM user_track WHERE user_id = ?",
        [user.user_id],
        (trackErr, trackResults) => {
          if (trackErr) {
            console.error("Error querying user_track: ", trackErr);
            return res.json({ message: "Error tracking user status" });
          }

          if (trackResults.length === 0) {
            // If no entry exists, insert a new row
            db.query(
              "INSERT INTO user_track (user_id, isActive, timestamp) VALUES (?, ?, NOW())",
              [user.user_id, true],
              (insertErr, insertResult) => {
                if (insertErr) {
                  console.error("Error inserting into user_track: ", insertErr);
                }
              }
            );
          } else {
            // If entry exists, update the row
            db.query(
              "UPDATE user_track SET isActive = ?, timestamp = NOW() WHERE user_id = ?",
              [true, user.user_id],
              (updateErr, updateResult) => {
                if (updateErr) {
                  console.error("Error updating user_track: ", updateErr);
                }
              }
            );
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

        // Update the user_track table to mark the user as inactive
        db.query(
          "UPDATE user_track SET isActive = ?, timestamp = NOW() WHERE user_id = ?",
          [false, user_id],
          (trackErr, trackResult) => {
            if (trackErr) {
              console.error("Error updating user_track: ", trackErr);
              return res.json({ message: "Error tracking user status" });
            }

            // Send a response confirming the logout and tracking update
            res.json({ message: "Logged out successfully" });
          }
        );
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

export const forgotPassword = (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.json({ message: "Email is required" });
  }

  // Query the database to find the user by email
  const query = "SELECT user_id, first_name FROM user WHERE email = ?";
  db.query(query, [email], (error, results) => {
    if (error) {
      console.error("Database error:", error);
      return res.json({ message: "Internal server error" });
    }

    if (results.length === 0) {
      return res.json({ message: "User not found" });
    }

    const user = results[0];

    // Create a JWT token with the user's ID, valid for 1 hour
    const token = jwt.sign({ userId: user.user_id }, jwtSecret, {
      expiresIn: "1h",
    });

    // Construct the password reset link
    const resetLink = `${process.env.DOMAIN}/reset_password/${token}`;

    const mailOptions = {
      from: "sivaranji5670@gmail.com",
      to: email,
      subject: "Password Reset Request - Dr. Ken Spine Coach",
      html: `
        <html>
          <body style="font-family: Arial, sans-serif; background-color: #001040; color: #ffffff; margin: 0; padding: 0;">
            <table width="100%" bgcolor="#001040" cellpadding="0" cellspacing="0" style="padding: 20px;">
              <tr>
                <td align="center">
                  <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden;">
                    <tr>
                      <td style="background-color: #001040; padding: 20px; text-align: center;">
                        <h1 style="color: #ffffff; margin: 0;">Dr. Ken Spine Coach</h1>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 20px; color: #333333;">
                        <h2 style="font-size: 24px; color: #001040; margin-bottom: 10px;">Reset Your Password</h2>
                        <p style="font-size: 16px; line-height: 1.5;">
                          Hi ${user.first_name},
                        </p>
                        <p style="font-size: 16px; line-height: 1.5;">
                          We received a request to reset your password for the <strong>Dr. Ken Spine Coach</strong> LMS platform. Click the button below to reset your password.
                        </p>
                        <div style="text-align: center; margin: 20px 0;">
                          <a href="${resetLink}" style="background-color: #001040; color: #ffffff; padding: 10px 20px; border-radius: 5px; text-decoration: none; font-size: 16px;">
                            Reset Password
                          </a>
                        </div>
                        <p style="font-size: 16px; line-height: 1.5;">
                          If you didn’t request a password reset, please ignore this email. This link will expire in 1 hour.
                        </p>
                      </td>
                    </tr>
                    <tr>
                      <td style="background-color: #001040; padding: 10px; text-align: center; color: #ffffff;">
                        <p style="font-size: 14px; margin: 0;">&copy; ${new Date().getFullYear()} Dr. Ken Spine Coach. All rights reserved.</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `,
    };

    // Send the email
    transporter.sendMail(mailOptions, (mailError) => {
      if (mailError) {
        console.error("Email error:", mailError);
        return res.json({ message: "Error sending reset email" });
      }

      res.json({
        message:
          "Password reset link sent successfully. Please check your email.",
      });
    });
  });
};

export const resetPassword = (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.json({ message: "Token and new password are required" });
  }

  // Verify the token
  jwt.verify(token, jwtSecret, (err, decoded) => {
    if (err) {
      return res.json({ message: "Invalid or expired token" });
    }

    const userId = decoded.userId;

    // Generate hashed password
    bcrypt.genSalt(10, (err, salt) => {
      if (err) {
        return res.json({ message: "Error generating salt" });
      }

      bcrypt.hash(newPassword, salt, (err, hashedPassword) => {
        if (err) {
          return res.json({ message: "Error hashing password" });
        }

        // Update password in both user and auth tables
        const updateUserQuery =
          "UPDATE user SET password = ? WHERE user_id = ?";
        const updateAuthQuery =
          "UPDATE auth SET password = ? WHERE user_id = ?";

        // Execute both update queries
        db.query(
          updateUserQuery,
          [hashedPassword, userId],
          (userError, userResults) => {
            if (userError) {
              console.error(
                "Error updating password in user table:",
                userError
              );
              return res.json({ message: "Database error" });
            }

            db.query(
              updateAuthQuery,
              [hashedPassword, userId],
              (authError, authResults) => {
                if (authError) {
                  console.error(
                    "Error updating password in auth table:",
                    authError
                  );
                  return res.json({ message: "Database error" });
                }

                if (
                  userResults.affectedRows === 0 ||
                  authResults.affectedRows === 0
                ) {
                  return res.json({ message: "User not found" });
                }

                res.json({
                  message: "Password updated successfully in both tables",
                });
              }
            );
          }
        );
      });
    });
  });
};
