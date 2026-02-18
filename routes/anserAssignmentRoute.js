const express = require("express");
const router = express.Router();
const answerAssignment = require("../models/answerAssignmentModel");
const giveAssignmentModel = require("../models/giveAssignmentModel");
const multer = require("multer");
const verifyToken = require("../middleware");
const Signup = require("../models/signupModel");
const Enrollment = require("../models/enrollmentModel");
const UserSubjects = require("../models/userSubjectModel");
const Students = require("../models/otpModel");
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "Gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({ storage: storage });

// Create a new assignment submission
router.post(
  "/postAnswerAssignment",
  verifyToken,
  upload.single("assignmentFile"),
  async (req, res) => {
    try {
      const { rollno } = req.user;
      const { subject, assignment } = req.body;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const existingAssignment = await giveAssignmentModel
        .findOne({ assignmentName: assignment })
        .lean();
      if (!existingAssignment) {
        return res.status(404).json({ error: "Assignment not found" });
      }

      const alreadySubmittedAssignment = await answerAssignment
        .findOne({ rollno, subject, assignment })
        .lean();
      if (alreadySubmittedAssignment) {
        return res.status(400).json({ error: "Assignment already submitted" });
      }

      const submittedDate = Date.now();
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const newAssignment = new answerAssignment({
        subject,
        assignment,
        assignmentFile: `${baseUrl}/uploads/${file.filename}`,
        rollno,
        submitteddate: submittedDate,
      });

      await newAssignment.save();

      // Status
      const dueDate = new Date(existingAssignment.dueDate);
      const status =
        submittedDate <= dueDate ? "Submitted on Time" : "Submitted Late";

      // Get student details
      const student = await Signup.findOne({ rollno }).lean();

      // Find teacher of this subject
      const enrollment = await Enrollment.findOne({
        "subjects.name": subject,
        "subjects.teacher": { $exists: true },
      });
      if (!enrollment) {
        return res
          .status(404)
          .json({ message: "No teacher found for this subject" });
      }

      const teacherInfo = enrollment.subjects.find((s) => s.name === subject);
      const teacherEmail = teacherInfo?.teacher;

      // Send email to teacher
      if (teacherEmail) {
        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: teacherEmail,
          subject: `Assignment Submitted by ${student?.name || "Student"}`,
          html: `
          <h3>Assignment Submission Notification</h3>
          <p><strong>Student:</strong> ${student?.name} (${student?.rollno})</p>
          <p><strong>Assignment:</strong> ${assignment}</p>
          <p><strong>Subject:</strong> ${subject}</p>
          <p><strong>Status:</strong> ${status}</p>
          <p><strong>Download:</strong> <a href="${baseUrl}/uploads/${file.filename}">Click here</a></p>
        `,
        };

        await transporter.sendMail(mailOptions);
      }

      res
        .status(201)
        .json({
          message: "Assignment submitted successfully.",
          newAssignment,
          status,
        });
    } catch (error) {
      console.error("Error creating assignment:", error);
      return res
        .status(500)
        .json({ message: "Error creating assignment", error });
    }
  },
);

// Read All assignments
router.get("/getassignments", async (req, res) => {
  try {
    const assignments = await answerAssignment.find();
    res.json(assignments);
  } catch (error) {
    res.status(500).json({ message: "Error fetching assignments", error });
  }
});

// Read One assignment
router.get("/getassignments/:id", async (req, res) => {
  try {
    const assignment = await answerAssignment.findById(req.params.id);
    if (!assignment)
      return res.status(404).json({ message: "Assignment not found" });
    res.json(assignment);
  } catch (error) {
    res.status(500).json({ message: "Error fetching assignment", error });
  }
});

// Get assignments by email
router.get("/getassignmentsbyemail", verifyToken, async (req, res) => {
  try {
    const { email } = req.user;
    const user = await Signup.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const assignments = await answerAssignment
      .find({ rollno: user.rollno })
      .lean()
      .exec();

    if (!assignments || assignments.length === 0) {
      return res.status(404).json({ message: "No assignments found" });
    }

    // Fetch corresponding give assignments and calculate status
    const assignmentPromises = assignments.map(async (assignment) => {
      const giveAssignment = await giveAssignmentModel
        .findOne({ assignmentName: assignment.assignment })
        .lean()
        .exec();

      if (giveAssignment) {
        const dueDate = new Date(giveAssignment.dueDate);
        const submittedDate = new Date(assignment.submitteddate);
        assignment.status =
          submittedDate <= dueDate ? "Submitted on Time" : "Submitted Late";
      } else {
        assignment.status = "Assignment details not found";
      }

      return assignment;
    });

    const assignmentsWithStatus = await Promise.all(assignmentPromises);

    res.json({ Assignment: assignmentsWithStatus });
  } catch (error) {
    console.error("Error fetching assignments:", error);
    res
      .status(500)
      .json({ message: "Error fetching assignments", error: error.message });
  }
});

// Get assignments by subject taught by the teacher
router.get("/getassignmentsbysubject", verifyToken, async (req, res) => {
  try {
    const { email } = req.user;
    const user = await Signup.findOne({ email });

    // If the user is not found, handle the error
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    // Find the enrollment details based on the teacher's name
    const enrollment = await Enrollment.findOne({
      "subjects.teacher": user.email,
    });

    if (!enrollment) {
      return res.status(404).json({ message: "Enrollment not found" });
    }
    // Extract the subjects taught by this teacher
    const subjectsTaught = enrollment.subjects
      .filter((subject) => subject.teacher === user.email)
      .map((subject) => subject.name);

    if (subjectsTaught.length === 0) {
      return res
        .status(404)
        .json({ message: "No subjects found for this teacher" });
    }

    // Find assignments for the subjects taught by this teacher
    const assignment = await answerAssignment.find({
      subject: { $in: subjectsTaught },
    });

    // Check if assignment is an empty array
    if (!assignment || assignment.length === 0) {
      return res.status(404).json({ message: "No assignment found" });
    }
    res.json({ Assignment: assignment });
  } catch (error) {
    console.error("Error fetching assignment:", error); // Log the error
    res
      .status(500)
      .json({ message: "Error fetching assignment", error: error.message });
  }
});

// Update assignment with new file upload
router.put(
  "/editassignments/:id",
  upload.single("assignmentFile"),
  async (req, res) => {
    try {
      const { subject, assignment } = req.body;
      const file = req.file;

      const existingAssignment = await answerAssignment.findById(req.params.id);

      if (!existingAssignment) {
        return res.status(404).json({ message: "Assignment not found" });
      }

      // If a new file is uploaded, update the file path
      let updatedData = {
        subject: subject || existingAssignment.subject,
        assignment: assignment || existingAssignment.assignment,
      };

      if (file) {
        const baseUrl = `${req.protocol}://${req.get("host")}`;
        updatedData.assignmentFile = `${baseUrl}/uploads/${file.filename}`;
      }

      const updatedAssignment = await answerAssignment.findByIdAndUpdate(
        req.params.id,
        updatedData,
        { new: true },
      );

      res.json({
        message: "Assignment updated successfully",
        updatedAssignment,
      });
    } catch (error) {
      console.error("Error updating assignment:", error);
      res.status(500).json({ message: "Error updating assignment", error });
    }
  },
);

// Delete assignment
router.delete("/delassignments/:id", async (req, res) => {
  try {
    const deletedAssignment = await answerAssignment.findByIdAndDelete(
      req.params.id,
    );
    if (!deletedAssignment)
      return res.status(404).json({ message: "Assignment not found" });

    res.json({ message: "Assignment deleted", deletedAssignment });
  } catch (error) {
    res.status(500).json({ message: "Error deleting assignment", error });
  }
});

// Function to search student data
async function searchStudent(query) {
  try {
    // Destructure query to get the actual search value
    const { email, rollno, name } = query;

    // Construct search criteria based on the provided query parameter
    const searchCriteria = {};
    if (email) searchCriteria.email = email;
    if (rollno) searchCriteria.rollno = rollno;
    if (name) searchCriteria.name = name;

    // Search in Register model
    const registerData = await Signup.findOne(searchCriteria).lean();

    if (!registerData) {
      return { message: "Student not found" };
    }

    const { email: studentEmail, rollno: studentRollno } = registerData;

    // Search in Students model (attendance)
    const attendanceData = await Students.find({ email: studentEmail }).lean();

    // Search in UserSubjects model (enrolled subjects)
    const subjectsData = await UserSubjects.findOne({
      userEmail: studentEmail,
    }).lean();

    // Search in Answer_Assignment model (uploaded assignments)
    const assignmentsData = await answerAssignment
      .find({ rollno: studentRollno })
      .lean();

    return {
      registerData,
      attendanceData,
      subjectsData,
      assignmentsData,
    };
  } catch (error) {
    console.error("Error searching student data:", error);
    return { message: "Error searching student data", error };
  }
}

// Route to search for student data
router.post("/search-student", async (req, res) => {
  const query = req.body.query;

  if (!query || (!query.email && !query.rollno && !query.name)) {
    return res.status(400).json({ message: "Query parameter is required" });
  }

  try {
    const result = await searchStudent(query);
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: "Internal server error", error });
  }
});

module.exports = router;
