import {
  getPeakRankInfo,
  getVoteInfo,
} from '../controllers/peak.controller.js';
import { getBookAndAchieveRankInfo } from '../controllers/rank.controller.js';
import {
  getTeamInfo,
  getUserInfo,
  getUserOnlineStatus,
} from '../controllers/user.controller.js';
import express from 'express';

const router: express.Router = express.Router();

router.get('/getUserOnlineStatus', getUserOnlineStatus);
router.get('/getUserInfo', getUserInfo);
router.get('/getTeamInfo', getTeamInfo);

router.get('/getVoteInfo', getVoteInfo);
router.get('/getPeakRankInfo', getPeakRankInfo);

router.get('/getBookAndAchieveRankInfo', getBookAndAchieveRankInfo);

export default router;
