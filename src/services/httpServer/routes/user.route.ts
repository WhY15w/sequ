import express from "express";
import {
  getUserOnlineStatus,
  getUserInfo,
  getTeamInfo,
} from "../controllers/user.controller.js";
import {
  getPeakRankInfo,
  getVoteInfo,
} from "../controllers/peak.controller.js";
import { getBookAndAchieveRankInfo } from "../controllers/rank.controller.js";

const router: express.Router = express.Router();

router.get("/getUserOnlineStatus", getUserOnlineStatus);
router.get("/getUserInfo", getUserInfo);
router.get("/getTeamInfo", getTeamInfo);

router.get("/getVoteInfo", getVoteInfo);
router.get("/getPeakRankInfo", getPeakRankInfo);

router.get("/getBookAndAchieveRankInfo", getBookAndAchieveRankInfo);

export default router;
