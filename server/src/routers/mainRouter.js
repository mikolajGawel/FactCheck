import express from 'express'
import { getResult, recvRequest } from '../controllers/mainController.js'

const router = express.Router()

router.post('/start',recvRequest)
router.get('/status', getResult)

const mainRouter = router;
export default mainRouter;