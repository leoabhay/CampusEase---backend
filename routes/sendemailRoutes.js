require("dotenv").config();
const express = require("express");
const router = express.Router();
const userRegister = require("../models/signupModel");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const verifyToken = require("../middleware");
const bcrypt = require("bcrypt");

const transporter = nodemailer.createTransport({
  service: "Gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

function sendVerificationEmail(user, baseUrl) {
  const token = jwt.sign(
    { email: user.email },
    process.env.SECRET_KEY,
    { expiresIn: "1h" }, // Token expires in 1 hour
  );
  const backendUrl =
    baseUrl || process.env.BACKEND_URL || "http://localhost:3200";
  const verificationUrl = `${backendUrl}/verify-signup?token=${token}`;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: user.email,
    subject: "Email Verification for Signup",
    html: `
      <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.5; max-width: 600px; margin: auto;">
        <h2 style="color: #2c3e50;">Verify Your Login</h2>
        <p>Hello,</p>
        <p>You have been registered on <strong>CampusEase</strong>. Use the following credentials to log in:</p>
        <table style="margin: 15px 0; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px; font-weight: bold;">Email:</td>
            <td style="padding: 8px;">${user.email}</td>
          </tr>
          <tr style="background-color: #f8f8f8;">
            <td style="padding: 8px; font-weight: bold;">Password:</td>
            <td style="padding: 8px;">${user.password || "N/A"}</td>
          </tr>
        </table>
        <p>Please click the button below to verify your login:</p>
        <p style="text-align: center; margin: 30px 0;">
          <a href="${verificationUrl}" 
             style="
               background-color: #007bff;
               color: #fff;
               padding: 12px 24px;
               text-decoration: none;
               border-radius: 6px;
               font-weight: bold;
               display: inline-block;
             ">
            Verify Your Login
          </a>
        </p>
        <p>If the button doesn’t work, copy and paste the following link into your browser:</p>
        <p style="word-break: break-all;">${verificationUrl}</p>
        <p>Thank you,<br/>CampusEase Team</p>
      </div>
    `,
  };
  return transporter.sendMail(mailOptions);
}

// User Registration Route
router.post("/signupUser", verifyToken, async (req, res) => {
  try {
    const { name, email, rollno, address, password, confirmPassword, role } =
      req.body;

    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    const currentDate = new Date();
    const formattedDate = currentDate.toDateString();

    // Save plain password for email (not for DB)
    const plainPassword = password;

    // Hash the password before saving
    const hashedPassword = await bcrypt.hash(password, 10);
    const hashedconfirmPassword = await bcrypt.hash(confirmPassword, 10);
    const user = await userRegister.findOne({ email });

    //const rollNumber = role === 'student' ? rollno : null;

    if (!user) {
      const newUser = new userRegister({
        name,
        email,
        rollno,
        address,
        password: hashedPassword,
        confirmPassword: hashedconfirmPassword,
        role,
        registereddate: formattedDate,
        isVerified: false,
        isPasswordSet: false,
      });

      const baseUrl = `${req.protocol}://${req.get("host")}`;
      await newUser.save();
      await sendVerificationEmail(
        {
          email: newUser.email,
          password: plainPassword,
        },
        baseUrl,
      );

      return res
        .status(201)
        .json({
          message:
            "Registration successful, please check your email to verify your account",
        });
    }

    if (user.isVerified) {
      return res.status(409).json({ message: "Already registered.", user });
    } else {
      const newUser = await userRegister.findOneAndUpdate(
        { email },
        {
          name,
          email,
          rollno,
          address,
          password: hashedPassword,
          confirmPassword,
          role,
          registereddate: formattedDate,
          isVerified: false,
        },
        { new: true },
      );

      const baseUrl = `${req.protocol}://${req.get("host")}`;
      await sendVerificationEmail(
        {
          email: updatedUser.email,
          password: plainPassword,
        },
        baseUrl,
      );
      console.log("Verification email sent to:", newUser.email);
      return res
        .status(200)
        .json({
          message:
            "Registration successful, please check your email to verify your account",
        });
    }
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Something went wrong", error: error.message });
  }
});

// user registration route ( for admin only )
router.post("/signupAdmin", async (req, res) => {
  try {
    const { name, email, address, password, confirmPassword } = req.body;

    if (!name || !email || !address || !password || !confirmPassword) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    const existingUser = await userRegister.findOne({ email });
    const plainPassword = password;
    const hashedPassword = await bcrypt.hash(password, 10);
    const currentDate = new Date().toDateString();

    if (!existingUser) {
      const newAdmin = new userRegister({
        name,
        email,
        address,
        password: hashedPassword,
        role: "admin", // forced
        registereddate: currentDate,
        isVerified: true, // mark as verified
        isPasswordSet: true, // mark as password set
      });

      const baseUrl = `${req.protocol}://${req.get("host")}`;
      await newAdmin.save();

      await sendVerificationEmail(
        {
          email: newAdmin.email,
          password: plainPassword,
        },
        baseUrl,
      );

      return res
        .status(201)
        .json({
          message:
            "Admin created successfully. Verification email sent. Please check your email",
        });
    }

    if (existingUser.isVerified) {
      return res
        .status(409)
        .json({ message: "Admin already exists and is verified." });
    } else {
      const updatedAdmin = await userRegister.findOneAndUpdate(
        { email },
        {
          name,
          address,
          password: hashedPassword,
          role: "admin",
          registereddate: currentDate,
          isVerified: false,
        },
        { new: true },
      );

      const baseUrl = `${req.protocol}://${req.get("host")}`;
      await sendVerificationEmail(
        {
          email: updatedAdmin.email,
          password: plainPassword,
        },
        baseUrl,
      );

      return res
        .status(200)
        .json({ message: "Admin updated and verification email re-sent." });
    }
  } catch (err) {
    console.error("Admin signup error:", err);
    return res
      .status(500)
      .json({ message: "Internal server error", error: err.message });
  }
});

// verify signup
router.get("/verify-signup", async (req, res) => {
  try {
    const { token } = req.query;

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.SECRET_KEY);
    } catch (err) {
      return res.json({ message: "Verification link expired or invalid" });
    }

    const user = await userRegister.findOne({ email: decoded.email });

    if (!user) {
      return res.json({ message: "Invalid verification link" });
    }

    user.isVerified = true;
    await user.save();
    console.log("Email verification successful");

    // Redirect user to reset-password page after verification
    const setPasswordToken = jwt.sign(
      { email: user.email },
      process.env.SECRET_KEY,
      { expiresIn: "15m" },
    );
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:4200";
    return res.redirect(
      `${frontendUrl}/set-password?token=${setPasswordToken}`,
    );
  } catch (error) {
    return res.status(500).json({ message: "Something went wrong", error });
  }
});

// Step 1: Request Reset Password - send email with token link
router.post("/request-reset-password", async (req, res) => {
  try {
    const { email } = req.body;

    const user = await userRegister.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }
    if (!user.isVerified) {
      return res.status(403).json({ message: "User is not verified" });
    }
    if (!user.isPasswordSet) {
      return res.status(400).json({
        message:
          "You have not set a password yet. Please use the original set password link.",
      });
    }

    const token = jwt.sign({ email: user.email }, process.env.SECRET_KEY, {
      expiresIn: "1h",
    });
    // IMPORTANT: This should point to your FRONTEND reset page URL (e.g., Angular app)
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:4200";
    const resetUrl = `${frontendUrl}/reset-password?token=${token}`;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: "Password Reset",
      html: `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
      <h2>Password Reset Request</h2>
      <p>Hello,</p>
      <p>You recently requested to reset your password for your account. Click the button below to reset it:</p>
      <p style="text-align: center;">
        <a href="${resetUrl}" 
           style="
             display: inline-block;
             padding: 12px 24px;
             font-size: 16px;
             color: white;
             background-color: #007bff;
             text-decoration: none;
             border-radius: 6px;
           "
           target="_blank"
           rel="noopener noreferrer"
        >
          Reset Password
        </a>
      </p>
      <p>If you did not request a password reset, please ignore this email.</p>
      <hr>
      <p style="font-size: 12px; color: #777;">
        If the button above does not work, copy and paste the following link into your browser:<br>
        <a href="${resetUrl}" style="color: #007bff;">${resetUrl}</a>
      </p>
      <p>Thanks,<br/>Your CampusEase Team</p>
    </div>
  `,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("Error sending email:", error);
        return res.status(500).json({ message: "Error sending email", error });
      }
      console.log("Reset password email sent:", info.response);
      res.json({ message: "Password reset link sent to your email", resetUrl });
    });
  } catch (error) {
    console.error("Request reset password error:", error);
    res.status(500).json({ message: "Internal server error", error });
  }
});

// Step 2: Reset Password - verify token & update password
router.post("/reset-password", async (req, res) => {
  try {
    const { newPassword, confirmPassword } = req.body;
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ message: "Token is required" });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.SECRET_KEY);
    } catch (err) {
      console.error("JWT verification error:", err);
      return res
        .status(400)
        .json({ message: "Invalid or expired token", error: err.message });
    }

    const user = await userRegister.findOne({ email: decoded.email });
    if (!user) {
      return res.status(400).json({ message: "User not found for this token" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;

    await user.save();

    res.json({ message: "Password reset successful" });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ message: "Internal server error", error });
  }
});

// Set password after first email verification
router.post("/set-password", async (req, res) => {
  try {
    const { newPassword, confirmPassword } = req.body;
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ message: "Token is required" });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.SECRET_KEY);
    } catch (err) {
      return res
        .status(400)
        .json({ message: "Invalid or expired token", error: err.message });
    }

    const user = await userRegister.findOne({ email: decoded.email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if newPassword is same as current password
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      return res.status(400).json({ message: "Change to a new password" });
    }

    // Only allow if user has not set password yet
    if (user.isPasswordSet) {
      return res
        .status(403)
        .json({ message: "Password already set. Please log in." });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    user.isPasswordSet = true; // mark as complete
    await user.save();

    return res.json({
      message: "Password set successfully. You can now log in.",
    });
  } catch (error) {
    console.error("Set password error:", error);
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
});

module.exports = router;
