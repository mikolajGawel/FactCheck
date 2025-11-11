import express from 'express'
import mainRouter from './routers/mainRouter.js'
import cors from "cors";

const app = express()
app.use(cors())
app.use(express.json());
app.use('/',mainRouter)

export default app;