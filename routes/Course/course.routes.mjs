import express from "express";
import upload from "../../middleware/fileUpload.mjs";
import {
  addCourse,
  addModule,
  getActivityData,
  getAllCourses,
  getCountsModuleAndEnrollment,
  getCourse,
  getModule,
  getModuleByCourseId,
  getModulePageContent,
  getModulesByCourseId,
  getOtherModules,
  getSingleCourse,
  getStructuredData,
  submitCourseContent,
  updateCourseById,
  updateModule,
  updatePageContent,
} from "../../controller/Course/course.controller.mjs";
const router = express.Router();

router.post("/addcourse", upload.single("courseImage"), addCourse);
router.post("/addmodule", upload.single("moduleImage"), addModule);

router.get("/getcourse", getCourse);
router.get("/getallcourse", getAllCourses);
router.put(
  "/updatecourse/:courseId",
  upload.single("courseImage"),
  updateCourseById
);
router.get("/getcourse/:id", getSingleCourse);
// Module Section
router.get("/getmodule", getModule);
router.put("/updatemodule", upload.single("moduleImage"), updateModule); // update the module name
router.get("/getmodulepagecontent/:moduleid", getModulePageContent);
router.put("/updatepagecontent", updatePageContent); // update page content
router.get("/getmodule/:courseId", getModulesByCourseId); // using isnide the Lessons compoennt
router.get("/getmodules/:courseId", getModuleByCourseId); // using inside the Coursecontent component

router.post("/submitcon", upload.single("video"), submitCourseContent); // using inside the Coursecontent component
router.get("/structured-data", getStructuredData);

router.get("/activity/:course_id/:module_id", getActivityData);
router.get("/:course/:module", getOtherModules);
router.get("/moduleandenrollcount", getCountsModuleAndEnrollment);

export default router;
