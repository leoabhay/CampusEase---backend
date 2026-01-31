require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const connectdb = require('./db');
const cors = require('cors');
const path = require('path');
const server = http.createServer(app);

// socket connection
const io = new Server(server, {
    cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:4200',
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        credentials: true
    }
});
const setupSocket = require('./socketServer');
setupSocket(io);

// connect to database
connectdb();

// import routes
const userRoutes= require('./routes/userRoute')
const discussion= require('./routes/discussionRoutes')
const joinClub= require('./routes/joinClubRoutes')
const sponsorShip= require('./routes/sponsorshipRoutes')
const addClub=require('./routes/addClubRoutes')
const enrollment= require('./routes/enrollmentRoutes')
const feedback= require('./routes/feedBackRoute')
const anserAssignment= require('./routes/anserAssignmentRoute')
const sponsorshipRequest= require('./routes/sponsorshipRequestRoute')
const createDepartmentRoute= require('./routes/createDepartmentRoute')
const jobVacancy= require('./routes/jobVacancyRoute')
const addEvent= require('./routes/eventRoute')
const giveAssignment= require('./routes/giveAssignmentRoutes')
const giveQuestion= require('./routes/giveQuestionRoute')
const AcademicRecord=require('./routes/AcademicRecordRoutes')
const otpRoutes=require('./routes/otpRoutes')
const internalExamRoutes=require('./routes/internalExamRoutes')
const excelRoutes=require('./routes/excelRoutes')
const profileRoutes=require('./routes/profileRoutes')
const InternalMarksPredictRoutes=require('./routes/InternalMarksPredictRoutes');
const idCard=require('./routes/idcardRoutes');
const sendemail=require('./routes/sendemailRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const messageRoutes = require('./routes/messageRoutes');
const cvRoutes = require('./routes/cvRoutes')
const feeRoutes = require('./routes/feeRoutes');
const scheduleRoutes = require('./routes/classScheduleRoutes');
const Academic = require('./routes/academicRoutes');
const Face = require('./routes/faceRoutes');

app.use(express.json());

// cors
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:4200', // frontend URL
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'], // allow JWT token header
  credentials: true,
};

app.use(cors(corsOptions));

// routes(api)
app.use(userRoutes);
app.use(discussion);
app.use(joinClub);
app.use(addClub);
app.use(enrollment);
app.use(createDepartmentRoute);
app.use(anserAssignment);
app.use(feedback);
app.use(sponsorShip);
app.use(sponsorshipRequest);
app.use(jobVacancy);
app.use(addEvent);
app.use(giveAssignment);
app.use(giveQuestion);
app.use(AcademicRecord);
app.use(otpRoutes);
app.use(internalExamRoutes);
app.use(profileRoutes);
app.use(InternalMarksPredictRoutes);
app.use(idCard);
app.use(excelRoutes);
app.use(sendemail);
app.use(attendanceRoutes);
app.use(messageRoutes);
app.use(cvRoutes);
app.use(feeRoutes);
app.use(scheduleRoutes);
app.use(Academic);
app.use(Face);

app.get('/', (req, res) => {
    res.send('API is running...');
});

// Serve static files from the "uploads" directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// start the server
server.listen(process.env.PORT || 3200, () => {
    console.log(`Server is running on port ${process.env.PORT || 3200}`);
});