const express = require("express");
const router = express.Router();
const ModelQuestion = require("../models/giveQuestionModel");
const verifyToken = require("../middleware");
const multer = require("multer");
const Signup = require("../models/signupModel");
const Enrollment = require("../models/enrollmentModel");
const UserSubjects = require("../models/userSubjectModel");
const nodemailer = require("nodemailer");
const fs = require("fs").promises;
const path = require("path");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({ storage: storage });

// Nodemailer transporter config
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// create a new model question
router.post(
  "/submit-model-question",
  verifyToken,
  upload.single("file"),
  async (req, res) => {
    try {
      const { subject, model_question } = req.body;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const filename = file.filename;
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const newModelQuestion = new ModelQuestion({
        subject,
        model_question,
        file: `${baseUrl}/uploads/${filename}`,
      });

      const savedModelQuestion = await newModelQuestion.save();

      // Find all students
      const students = await Signup.find({ role: "student" });
      if (!students.length) {
        return res
          .status(404)
          .json({ message: "No students found to send email" });
      }

      // Read uploaded file content
      const filePath = path.join(__dirname, "../uploads", filename);
      const fileContent = await fs.readFile(filePath);

      // Send email to all students
      const emailPromises = students.map((student) => {
        return transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: student.email,
          subject: `New Model Question Uploaded - Subject: ${subject}`,
          text: `A new model question has been uploaded.\n\nSubject: ${subject}\nDescription: ${model_question}`,
          attachments: [
            {
              filename: file.originalname,
              content: fileContent,
            },
          ],
        });
      });

      await Promise.all(emailPromises);

      res.status(201).json({
        message: `Model question uploaded and emailed to ${students.length} students`,
        data: savedModelQuestion,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: err.message });
    }
  },
);

// Read All model questions
router.get("/model-questions", async (req, res) => {
  try {
    const modelQuestions = await ModelQuestion.find();
    res.json(modelQuestions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Read One model question
router.get("/model-questions/:id", async (req, res) => {
  try {
    const modelQuestion = await ModelQuestion.findById(req.params.id);
    if (!modelQuestion) {
      return res.status(404).json({ message: "Model question not found" });
    }
    res.json(modelQuestion);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Read One by email (teacher)
router.get("/getmodelquestiongivenbyemail", verifyToken, async (req, res) => {
  try {
    const { email } = req.user;
    const user = await Signup.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const enrollment = await Enrollment.findOne({
      "subjects.teacher": user.email,
    });

    if (!enrollment) {
      return res.status(404).json({ message: "Enrollment not found" });
    }

    const subjectsTaught = enrollment.subjects
      .filter((subject) => subject.teacher === user.email)
      .map((subject) => subject.name);

    if (subjectsTaught.length === 0) {
      return res
        .status(404)
        .json({ message: "No subjects found for this teacher" });
    }

    const question = await ModelQuestion.find({
      subject: { $in: subjectsTaught },
    });

    if (!question || question.length === 0) {
      return res.status(404).json({ message: "No model question found" });
    }

    res.json({ Model_Question: question });
  } catch (error) {
    console.error("Error fetching question:", error);
    res
      .status(500)
      .json({ message: "Error fetching question", error: error.message });
  }
});

// Get questions by enrolled subjects (student)
router.get("/getQuestionsByEnrolledSubject", verifyToken, async (req, res) => {
  try {
    const { email } = req.user;

    const enrollment = await UserSubjects.findOne({ userEmail: email });

    if (!enrollment) {
      return res
        .status(404)
        .json({ message: "Enrollment not found for the user" });
    }

    const enrolledSubjects = enrollment.subjects.map((subject) => subject.name);

    const questions = await ModelQuestion.find({
      subject: { $in: enrolledSubjects },
    });

    if (!questions || questions.length === 0) {
      return res
        .status(404)
        .json({ message: "No questions found for enrolled subjects" });
    }

    res.json({ Model_Questions: questions });
  } catch (error) {
    console.error("Error fetching questions:", error);
    res
      .status(500)
      .json({ message: "Error fetching questions", error: error.message });
  }
});

// Update model question with optional new file upload
router.put("/model-questions/:id", upload.single("file"), async (req, res) => {
  try {
    const updateData = { ...req.body };

    if (req.file) {
      // If a new file is uploaded, update the file URL
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      updateData.file = `${baseUrl}/uploads/${req.file.filename}`;
    }

    const modelQuestion = await ModelQuestion.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true },
    );
    if (!modelQuestion) {
      return res.status(404).json({ message: "Model question not found" });
    }
    res.json(modelQuestion);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Delete model question
router.delete("/model-questions/:id", async (req, res) => {
  try {
    const modelQuestion = await ModelQuestion.findByIdAndDelete(req.params.id);
    if (!modelQuestion) {
      return res.status(404).json({ message: "Model question not found" });
    }
    res.json({ message: "Model question deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
