import express from "express";
import {
  checkTransaction,
  companyEmailDetail,
  countInvitedLearners,
  countTotalUsers,
  enrolledUserCount,
  getActiveCount,
  getCoursesAndUserDetail,
  getLicenseCountByCompanyId,
  getPaidUsersCount,
  getSpocNameByCompanyId,
  getUnenrolledInvitees,
  getUserStats,
  getUserStatusCounts,
  inactiveInvites,
  inviteLearners,
  neftTransaction,
  paymentCheckOut,
  paymentWebhook,
  remainderMail,
} from "../../controller/admin/admin.controller.mjs";
const router = express.Router();

router.get("/paidusercount", getPaidUsersCount);
router.get("/userstatus", getUserStatusCounts);
router.get("/totaluser", countTotalUsers);
// ---------------------------------------------------------------
router.post("/invite_learners/:company_id", inviteLearners);
router.get("/bussuserdetails/:bussiness_id", companyEmailDetail);
router.post("/nefttransation/:bussiness_id", neftTransaction);
router.post("/checktransation/:bussiness_id", checkTransaction);

router.get("/licensecount/:company_id", getLicenseCountByCompanyId);
router.get("/invitecount/:company_id", countInvitedLearners);
router.get("/enrolledcount/:company_id", enrolledUserCount);
router.get("/unenrollcount/:company_id", getUnenrolledInvitees);
router.get("/getspocname/:company_id", getSpocNameByCompanyId);
router.post("/remaindermail/:company_id", remainderMail);
router.post("/inactiveInvites/:company_id", inactiveInvites);
router.get("/userstates/:company_id", getUserStats);

router.post("/create-checkout-session/:company_id", paymentCheckOut);
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  paymentWebhook
);

router.get("/getcourse/:id", getCoursesAndUserDetail);
router.get("/getactivecount/:id",getActiveCount);

export default router;
