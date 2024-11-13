import express from "express";
import { checkUserPaymentStatus, composeMessage, getAllMessage, getAllUsers, getModuleCompletion, getModuleCompletionForCertificate, getUserAssessmentLogs, getUserById, getUserWorkHours, updateUserProfile, userPaymentVerification} from "../../controller/User/user.controller.mjs";
import upload from "../../middleware/fileUpload.mjs";

const router = express.Router();

router.get('/getallusers',getAllUsers)
router.get("/user/:id", getUserById);
router.get('/userworkhour/:id',getUserWorkHours)
router.get("/assessment-logs/:user_id",getUserAssessmentLogs)
router.get('/paymentstatus/:id',checkUserPaymentStatus)
router.post('/composemessage',composeMessage)
router.get('/getallmsg/:id',getAllMessage)
router.post('/updateprofile/:id',upload.single("profile_image"),updateUserProfile)
router.get('/payverify/:id',userPaymentVerification)
router.get("/grade/:userId",getModuleCompletion)
router.get("/gradecertificate/:user_id",getModuleCompletionForCertificate)

export default router;
