require("dotenv").config();
const express = require("express");
const router = express.Router();
const multer = require("multer");
const userRegister = require("../models/signupModel");
const jwt = require("jsonwebtoken");
const verifyToken = require("../middleware");
const bcrypt = require("bcrypt");
const Assignment = require("../models/answerAssignmentModel");
const Course = require("../models/enrollmentModel");
const Attendance = require("../models/otpModel");
const Club = require("../models/addClubModel");
const FaceAttendance = require("../models/faceModel");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({ storage: storage });

// create a new user
router.post("/signup", async (req, res) => {
  try {
    const { name, email, rollno, address, password, confirmPassword, role } =
      req.body;

    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new userRegister({
      name,
      email,
      rollno,
      address,
      password: hashedPassword,
      confirmPassword: hashedPassword,
      role,
      isVerified: false, // required field
    });

    await newUser.save();
    res.json({ message: "Register Successful" });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Something went wrong", error: error.message });
  }
});

// get faculty users
router.get("/user/faculty", async (req, res) => {
  try {
    const faculty = await userRegister.find({ role: "faculty" });
    const count = await userRegister.countDocuments({ role: "faculty" });
    res.json({ faculty, count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// get student users
router.get("/user/student", async (req, res) => {
  try {
    const student = await userRegister.find({ role: "student" });
    const count = await userRegister.countDocuments({ role: "student" });
    res.json({ student, count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// get secretary users
router.get("/user/secretary", async (req, res) => {
  try {
    const secretary = await userRegister.find({ role: "secretary" });
    const count = await userRegister.countDocuments({ role: "secretary" });
    res.json({ secretary, count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// login user
router.post("/signin", async (req, res) => {
  try {
    const { email, password } = req.body;
    const userData = await userRegister.findOne({ email });
    if (!userData) {
      console.log("User not found");
      return res.json({ message: "username is not found " });
    }
    if (userData.isVerified != true) {
      return res.json({
        message: "User is not verified. Please verify before login! ",
        userData,
      });
    }
    if (!userData.isPasswordSet) {
      return res
        .status(403)
        .json({ message: "Please set your password before logging in." });
    }
    const userPasswordMatch = await bcrypt.compare(password, userData.password);
    //const userPasswordMatch = password === userData.password;
    if (!userPasswordMatch) {
      // console.log('password doesnot match ');
      return res.json({ message: "password is incorrect" });
    }
    const userRole = userData.role;
    // const token = jwt.sign({ email: userData.email }, 'process.env.SECRET_KEY');
    const token = jwt.sign(
      {
        email: userData.email,
        userId: userData._id,
        name: userData.name,
        rollno: userData.rollno,
        role: userData.role,
      },
      process.env.SECRET_KEY,
    );

    res.json({ message: "Login Sucessfull", role: userRole, token: token });
  } catch (error) {
    res
      .status(500)
      .json({ message: "something went wrong", error: error.stack });
  }
});

// get all user data
router.get("/userdata", async (req, res) => {
  const userData = await userRegister.find();
  res.json({ userData: userData });
});

// get user data ( for user profile )
router.get("/getuserdata", verifyToken, async (req, res) => {
  try {
    const { email } = req.user;
    const userdata = await userRegister.findOne({ email });
    if (userdata) {
      return res.json({ data: userdata });
    } else {
      res.status(404).json({ message: "data not found" });
    }
  } catch (error) {
    res.status(500).json({ messgae: "something is error", error });
  }
});

// update user data ( for user profile )
router.put(
  "/userdata/:id",
  verifyToken,
  upload.single("photo"),
  async (req, res) => {
    try {
      const { address } = req.body;
      const file = req.file;

      const updateData = {};

      if (address && address !== "") {
        updateData.address = address;
      }

      if (file) {
        const baseUrl = `${req.protocol}://${req.get("host")}`;
        updateData.photo = `${baseUrl}/uploads/${file.filename}`;
      }

      const updatedUser = await userRegister.findByIdAndUpdate(
        req.params.id,
        { $set: updateData },
        { new: true },
      );

      res.json({
        message: "Profile updated successfully!",
        userdata: updatedUser,
      });
    } catch (error) {
      res.status(500).json({ message: "Something went wrong", error });
    }
  },
);

// update user password
// This route allows users to update their password after verifying their old password
router.put("/password/:id", verifyToken, async (req, res) => {
  try {
    const { oldpassword, password, confirmPassword } = req.body;

    // Fetch user by ID
    const user = await userRegister.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Compare old password with hashed password in DB
    const isMatch = await bcrypt.compare(oldpassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: "Old password is incorrect" });
    }

    // Check if new passwords match
    if (password !== confirmPassword) {
      return res.status(400).json({ error: "New password did not match" });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update password in DB
    const updatedUser = await userRegister.findByIdAndUpdate(
      req.params.id,
      { password: hashedPassword, confirmPassword: hashedPassword }, // optional to store confirmPassword
      { new: true },
    );

    res.json({
      message: "Password updated successfully",
      userdata: updatedUser,
    });
  } catch (error) {
    res.status(500).json({ message: "Something went wrong", error });
  }
});

// delete user
// This route allows an admin to delete a user by their ID
router.delete("/user/:id", verifyToken, async (req, res) => {
  try {
    const user = await userRegister.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json({ message: "User deleted", user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Filter students by email or roll number or name
// Search one student
router.get("/student/search", async (req, res) => {
  try {
    const { name, rollno, email } = req.query;

    const orConditions = [];

    if (name) orConditions.push({ name: { $regex: name, $options: "i" } });
    if (email) orConditions.push({ email: { $regex: email, $options: "i" } });
    if (rollno && !isNaN(Number(rollno))) {
      orConditions.push({ rollno: Number(rollno) });
    }

    if (orConditions.length === 0) {
      return res.status(400).json({
        message:
          "At least one of name, email or roll number must be provided and valid",
      });
    }

    const student = await userRegister.findOne({ $or: orConditions }).lean();
    if (!student) {
      return res.status(404).json({ message: "No student found" });
    }

    // Fetch related data including face attendance
    const [assignments, allCourses, attendanceRecords, faceAttendanceRecords] =
      await Promise.all([
        Assignment.find({ rollno: student.rollno }).lean(),
        Course.find({ department: student.department || /.*/ }).lean(),
        Attendance.find({
          $or: [{ name: student.name }, { email: student.email }],
        }).lean(),
        FaceAttendance.find({ rollno: student.rollno }).lean(), // fetch face attendance records for the student
      ]);

    res.status(200).json({
      ...student,
      assignments,
      courses: allCourses,
      attendance: attendanceRecords,
      faceAttendance: faceAttendanceRecords, // add face attendance here
    });
  } catch (error) {
    console.error("Error fetching student:", error);
    res
      .status(500)
      .json({ message: "Error fetching student", error: error.message });
  }
});

// Search one faculty
router.get("/faculty/search", async (req, res) => {
  try {
    const { name, email } = req.query;
    const orConditions = [];

    if (name) orConditions.push({ name: { $regex: name, $options: "i" } });
    if (email) orConditions.push({ email: { $regex: email, $options: "i" } });

    if (orConditions.length === 0) {
      return res
        .status(400)
        .json({ message: "At least name or email must be provided and valid" });
    }

    const faculty = await userRegister
      .findOne({ role: "faculty", $or: orConditions })
      .lean();
    if (!faculty) {
      return res.status(404).json({ message: "No faculty found" });
    }

    res.status(200).json({
      name: faculty.name,
      email: faculty.email,
      address: faculty.address,
      registereddate: faculty.registereddate,
      photo: faculty.photo || null,
    });
  } catch (error) {
    console.error("Error fetching faculty:", error);
    res
      .status(500)
      .json({ message: "Error fetching faculty", error: error.message });
  }
});

// Search one secretary
router.get("/secretary/search", async (req, res) => {
  try {
    const { name, email } = req.query;

    const orConditions = [];
    if (name) orConditions.push({ name: { $regex: name, $options: "i" } });
    if (email) orConditions.push({ email: { $regex: email, $options: "i" } });

    if (orConditions.length === 0) {
      return res
        .status(400)
        .json({ message: "At least name or email must be provided and valid" });
    }

    const secretary = await userRegister
      .findOne({ role: "secretary", $or: orConditions })
      .lean();
    if (!secretary) {
      return res.status(404).json({ message: "No secretary found" });
    }

    const club = await Club.findOne({ contactEmail: secretary.email }).lean();

    res.status(200).json({
      name: secretary.name,
      email: secretary.email,
      address: secretary.address,
      registereddate: secretary.registereddate,
      photo: secretary.photo || null,
      club: club || null,
    });
  } catch (error) {
    console.error("Error fetching secretary:", error);
    res
      .status(500)
      .json({ message: "Error fetching secretary", error: error.message });
  }
});

// Get all users regardless of role
router.get("/users", async (req, res) => {
  try {
    const users = await userRegister.find({});
    res.json({ users, count: users.length });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to get users", error: error.message });
  }
});

// update the user
router.put("/updateUser/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;
    const updatedUser = await userRegister.findByIdAndUpdate(id, updatedData, {
      new: true,
    });
    res.json({ message: "User updated successfully", updatedUser });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to update user", error: error.message });
  }
});

module.exports = router;
