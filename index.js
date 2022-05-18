import express from 'express'
import cors from "cors"
import 'dotenv/config'
import { MongoClient, ServerApiVersion } from 'mongodb'
import jwt from 'jsonwebtoken'
const port = process.env.PORT || 5000
const app = express()

app.use(cors())
app.use(express.json())

// verify token middleware function 

function verifyJWT(req, res, next) {
    const authorization = req.headers.authorization
    if (!authorization) return res.status(401).send({ message: 'Unauthorized Access' })
    const token = authorization.split(' ')[1]
    jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
        if (err) return res.status(403).send({ message: 'Forbidden Access' })
        req.decoded = decoded
        next()
    })
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@doctors-portal.yfumd.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 })

async function run() {
    try {
        await client.connect()

        const servicesCollection = client.db("doctors_portal").collection("services")
        const bookingCollection = client.db("doctors_portal").collection("booking")
        const usersCollection = client.db("doctors_portal").collection("users")

        // all services API 

        app.get('/services', async (req, res) => {
            const query = {}
            const cursor = servicesCollection.find(query)
            const result = await cursor.toArray()
            res.send(result)
        })

        // booking API 

        app.post('/booking', async (req, res) => {
            const booking = req.body
            const query = { treatment: booking.treatment, patientEmail: booking.patientEmail, date: booking.date }
            const exists = await bookingCollection.findOne(query)
            if (exists) return res.send({ success: false, booking: exists })
            const result = await bookingCollection.insertOne(booking)
            res.send({ success: true, result })
        })

        app.get('/booking', verifyJWT, async (req, res) => {
            const patientEmail = req.query.email
            const decodedEmail = req.decoded.email
            if (patientEmail === decodedEmail) {
                const query = { patientEmail: patientEmail }
                const result = await bookingCollection.find(query).toArray()
                res.send(result)
            }
            else return res.status(403).send({message: 'Forbidden Access'})
        })

        // availbale appointments API 

        app.get('/available', async (req, res) => {
            const services = await servicesCollection.find().toArray()
            const query = { date: req.query.date }
            const bookings = await bookingCollection.find(query).toArray()
            services.forEach(service => {
                const serviceBooking = bookings.filter(b => b.treatment === service.name)
                const booked = serviceBooking.map(s => s.slot)
                service.booked = booked;
                const availbale = service.slots.filter(s => !booked.includes(s))
                service.slots = availbale
            })

            res.send(services)
        })

        // users put API

        app.put('/user/:email', async (req, res) => {
            const email = req.params.email
            const user = req.body
            const filter = { email: email }
            const options = { upsert: true }
            const updateDoc = {
                $set: user
            }
            const result = await usersCollection.updateOne(filter, updateDoc, options)
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN, { expiresIn: '3d' })
            res.send({ result, token })
        })


    }
    finally {

    }
}

run().catch(console.dir)

app.get('/', (req, res) => {
    res.send('Hello form doctors portal')
})

app.listen(port, () => {
    console.log(port)
})

