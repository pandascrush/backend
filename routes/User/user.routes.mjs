import express from "express";
import { checkUserPaymentStatus, composeMessage, getAllMessage, getAllUsers, getUserAssessmentLogs, getUserById, getUserWorkHours, updateUserProfile, userPaymentVerification} from "../../controller/User/user.controller.mjs";
import upload from "../../middleware/fileUpload.mjs";

const router = express.Router();

router.get('/getallusers',getAllUsers)
router.get("/user/:id", getUserById);
router.get('/userworkhour/:id',getUserWorkHours)
router.get("/assessment-logs/:user_id",getUserAssessmentLogs)
router.get('/paymentstatus/:id',checkUserPaymentStatus)
router.post('/composemessage',composeMessage)
router.get('/getallmsg',getAllMessage)
router.post('/updateprofile/:id',upload.single("profile_image"),updateUserProfile)
router.get('/payverify/:id',userPaymentVerification)

export default router;